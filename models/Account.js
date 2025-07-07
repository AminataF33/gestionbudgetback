const mongoose = require("mongoose")

const accountSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "L'ID utilisateur est requis"],
    },
    name: {
      type: String,
      required: [true, "Le nom du compte est requis"],
      trim: true,
      maxlength: [100, "Le nom du compte ne peut pas dépasser 100 caractères"],
    },
    bank: {
      type: String,
      required: [true, "La banque est requise"],
      enum: [
        "CBAO",
        "SGBS",
        "BOA",
        "Ecobank",
        "UBA",
        "BHS",
        "BICIS",
        "Banque Atlantique",
        "BNDE",
        "Crédit du Sénégal",
        "Autre",
      ],
    },
    type: {
      type: String,
      required: [true, "Le type de compte est requis"],
      enum: ["checking", "savings", "credit", "investment"],
      default: "checking",
    },
    balance: {
      type: Number,
      required: [true, "Le solde est requis"],
      default: 0,
      min: [0, "Le solde ne peut pas être négatif"],
    },
    currency: {
      type: String,
      default: "CFA",
      enum: ["CFA", "EUR", "USD"],
    },
    accountNumber: {
      type: String,
      trim: true,
      sparse: true, // Permet les valeurs nulles uniques
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    description: {
      type: String,
      maxlength: [500, "La description ne peut pas dépasser 500 caractères"],
    },
    color: {
      type: String,
      default: "#3B82F6",
      match: [/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/, "Format de couleur invalide"],
    },
    icon: {
      type: String,
      default: "CreditCard",
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
)

// Index pour améliorer les performances
accountSchema.index({ userId: 1 })
accountSchema.index({ userId: 1, isActive: 1 })
accountSchema.index({ bank: 1 })
accountSchema.index({ type: 1 })

// Virtual pour le type de compte en français
accountSchema.virtual("typeLabel").get(function () {
  const types = {
    checking: "Compte Courant",
    savings: "Épargne",
    credit: "Crédit",
    investment: "Investissement",
  }
  return types[this.type] || this.type
})

// Virtual pour le solde formaté
accountSchema.virtual("formattedBalance").get(function () {
  return new Intl.NumberFormat("fr-SN", {
    style: "currency",
    currency: this.currency === "CFA" ? "XOF" : this.currency,
  }).format(this.balance)
})

// Middleware pour valider le solde avant sauvegarde
accountSchema.pre("save", function (next) {
  if (this.type === "credit" && this.balance < 0) {
    this.balance = Math.abs(this.balance)
  }
  next()
})

// Méthode pour mettre à jour le solde
accountSchema.methods.updateBalance = async function (amount, operation = "add") {
  if (operation === "add") {
    this.balance += amount
  } else if (operation === "subtract") {
    this.balance -= amount
  } else {
    this.balance = amount
  }

  // Vérifier que le solde ne devient pas négatif pour les comptes normaux
  if (this.type !== "credit" && this.balance < 0) {
    throw new Error("Solde insuffisant")
  }

  return await this.save()
}

// Méthode statique pour obtenir le solde total d'un utilisateur
accountSchema.statics.getTotalBalance = async function (userId) {
  const result = await this.aggregate([
    { $match: { userId: mongoose.Types.ObjectId(userId), isActive: true } },
    { $group: { _id: null, total: { $sum: "$balance" } } },
  ])

  return result[0]?.total || 0
}

// Méthode statique pour obtenir les statistiques des comptes
accountSchema.statics.getAccountStats = async function (userId) {
  const stats = await this.aggregate([
    { $match: { userId: mongoose.Types.ObjectId(userId), isActive: true } },
    {
      $group: {
        _id: "$type",
        count: { $sum: 1 },
        totalBalance: { $sum: "$balance" },
        avgBalance: { $avg: "$balance" },
      },
    },
  ])

  return stats
}

module.exports = mongoose.model("Account", accountSchema)
