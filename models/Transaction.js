const mongoose = require("mongoose")

const transactionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "L'ID utilisateur est requis"],
    },
    accountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Account",
      required: [true, "L'ID du compte est requis"],
    },
    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      required: [true, "L'ID de la catégorie est requis"],
    },
    type: {
      type: String,
      required: [true, "Le type de transaction est requis"],
      enum: ["income", "expense", "transfer"],
    },
    amount: {
      type: Number,
      required: [true, "Le montant est requis"],
      min: [0.01, "Le montant doit être supérieur à 0"],
    },
    description: {
      type: String,
      required: [true, "La description est requise"],
      trim: true,
      maxlength: [500, "La description ne peut pas dépasser 500 caractères"],
    },
    date: {
      type: Date,
      required: [true, "La date est requise"],
      default: Date.now,
    },
    merchant: {
      type: String,
      trim: true,
      maxlength: [200, "Le nom du marchand ne peut pas dépasser 200 caractères"],
    },
    location: {
      address: String,
      city: String,
      coordinates: {
        latitude: Number,
        longitude: Number,
      },
    },
    paymentMethod: {
      type: String,
      enum: ["cash", "card", "transfer", "mobile_money", "check", "other"],
      default: "cash",
    },
    currency: {
      type: String,
      default: "CFA",
      enum: ["CFA", "EUR", "USD"],
    },
    exchangeRate: {
      type: Number,
      default: 1,
      min: [0, "Le taux de change doit être positif"],
    },
    tags: [
      {
        type: String,
        trim: true,
        maxlength: [50, "Un tag ne peut pas dépasser 50 caractères"],
      },
    ],
    receipt: {
      url: String,
      filename: String,
      size: Number,
    },
    isRecurring: {
      type: Boolean,
      default: false,
    },
    recurringPattern: {
      frequency: {
        type: String,
        enum: ["daily", "weekly", "monthly", "yearly"],
      },
      interval: {
        type: Number,
        min: 1,
      },
      endDate: Date,
    },
    transferAccountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Account",
    },
    status: {
      type: String,
      enum: ["pending", "completed", "cancelled"],
      default: "completed",
    },
    notes: {
      type: String,
      maxlength: [1000, "Les notes ne peuvent pas dépasser 1000 caractères"],
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
)

// Index pour améliorer les performances
transactionSchema.index({ userId: 1 })
transactionSchema.index({ accountId: 1 })
transactionSchema.index({ categoryId: 1 })
transactionSchema.index({ date: -1 })
transactionSchema.index({ type: 1 })
transactionSchema.index({ userId: 1, date: -1 })
transactionSchema.index({ userId: 1, type: 1 })
transactionSchema.index({ userId: 1, accountId: 1, date: -1 })

// Index pour la recherche textuelle
transactionSchema.index({ description: "text", merchant: "text", notes: "text" })

// Virtual pour le montant formaté
transactionSchema.virtual("formattedAmount").get(function () {
  return new Intl.NumberFormat("fr-SN", {
    style: "currency",
    currency: this.currency === "CFA" ? "XOF" : this.currency,
  }).format(this.amount)
})

// Virtual pour la méthode de paiement en français
transactionSchema.virtual("paymentMethodLabel").get(function () {
  const methods = {
    cash: "Espèces",
    card: "Carte",
    transfer: "Virement",
    mobile_money: "Mobile Money",
    check: "Chèque",
    other: "Autre",
  }
  return methods[this.paymentMethod] || this.paymentMethod
})

// Middleware pour valider les transferts
transactionSchema.pre("save", function (next) {
  if (this.type === "transfer" && !this.transferAccountId) {
    return next(new Error("Le compte de destination est requis pour un transfert"))
  }

  if (this.type === "transfer" && this.transferAccountId.equals(this.accountId)) {
    return next(new Error("Le compte source et destination ne peuvent pas être identiques"))
  }

  next()
})

// Middleware pour mettre à jour le solde du compte après une transaction
transactionSchema.post("save", async (doc) => {
  try {
    const Account = mongoose.model("Account")
    const account = await Account.findById(doc.accountId)

    if (account) {
      if (doc.type === "income") {
        account.balance += doc.amount
      } else if (doc.type === "expense") {
        account.balance -= doc.amount
      } else if (doc.type === "transfer") {
        // Débit du compte source
        account.balance -= doc.amount

        // Crédit du compte destination
        const destinationAccount = await Account.findById(doc.transferAccountId)
        if (destinationAccount) {
          destinationAccount.balance += doc.amount
          await destinationAccount.save()
        }
      }

      await account.save()
    }
  } catch (error) {
    console.error("Erreur lors de la mise à jour du solde:", error)
  }
})

// Méthode statique pour obtenir les statistiques des transactions
transactionSchema.statics.getTransactionStats = async function (userId, startDate, endDate) {
  const matchStage = {
    userId: mongoose.Types.ObjectId(userId),
    status: "completed",
  }

  if (startDate && endDate) {
    matchStage.date = {
      $gte: new Date(startDate),
      $lte: new Date(endDate),
    }
  }

  const stats = await this.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: "$type",
        count: { $sum: 1 },
        total: { $sum: "$amount" },
        avg: { $avg: "$amount" },
        min: { $min: "$amount" },
        max: { $max: "$amount" },
      },
    },
  ])

  return stats
}

// Méthode statique pour obtenir les dépenses par catégorie
transactionSchema.statics.getExpensesByCategory = async function (userId, startDate, endDate) {
  const matchStage = {
    userId: mongoose.Types.ObjectId(userId),
    type: "expense",
    status: "completed",
  }

  if (startDate && endDate) {
    matchStage.date = {
      $gte: new Date(startDate),
      $lte: new Date(endDate),
    }
  }

  return await this.aggregate([
    { $match: matchStage },
    {
      $lookup: {
        from: "categories",
        localField: "categoryId",
        foreignField: "_id",
        as: "category",
      },
    },
    { $unwind: "$category" },
    {
      $group: {
        _id: "$categoryId",
        categoryName: { $first: "$category.name" },
        categoryColor: { $first: "$category.color" },
        categoryIcon: { $first: "$category.icon" },
        total: { $sum: "$amount" },
        count: { $sum: 1 },
        avg: { $avg: "$amount" },
      },
    },
    { $sort: { total: -1 } },
  ])
}

// Méthode statique pour la recherche de transactions
transactionSchema.statics.searchTransactions = async function (userId, query, options = {}) {
  const { page = 1, limit = 20, sortBy = "date", sortOrder = -1 } = options

  const searchQuery = {
    userId: mongoose.Types.ObjectId(userId),
    $text: { $search: query },
  }

  const transactions = await this.find(searchQuery)
    .populate("accountId", "name bank")
    .populate("categoryId", "name color icon")
    .sort({ [sortBy]: sortOrder })
    .skip((page - 1) * limit)
    .limit(limit)

  const total = await this.countDocuments(searchQuery)

  return {
    transactions,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  }
}

module.exports = mongoose.model("Transaction", transactionSchema)
