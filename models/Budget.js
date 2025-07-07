const mongoose = require("mongoose")

const budgetSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "L'ID utilisateur est requis"],
    },
    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      required: [true, "L'ID de la catégorie est requis"],
    },
    name: {
      type: String,
      required: [true, "Le nom du budget est requis"],
      trim: true,
      maxlength: [200, "Le nom ne peut pas dépasser 200 caractères"],
    },
    amount: {
      type: Number,
      required: [true, "Le montant du budget est requis"],
      min: [0.01, "Le montant doit être supérieur à 0"],
    },
    spent: {
      type: Number,
      default: 0,
      min: [0, "Le montant dépensé ne peut pas être négatif"],
    },
    period: {
      type: String,
      required: [true, "La période est requise"],
      enum: ["weekly", "monthly", "quarterly", "yearly"],
      default: "monthly",
    },
    startDate: {
      type: Date,
      required: [true, "La date de début est requise"],
    },
    endDate: {
      type: Date,
      required: [true, "La date de fin est requise"],
    },
    alertThreshold: {
      type: Number,
      default: 80,
      min: [0, "Le seuil d'alerte doit être positif"],
      max: [100, "Le seuil d'alerte ne peut pas dépasser 100%"],
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
    notifications: {
      enabled: {
        type: Boolean,
        default: true,
      },
      lastSent: {
        type: Date,
      },
    },
    rollover: {
      enabled: {
        type: Boolean,
        default: false,
      },
      amount: {
        type: Number,
        default: 0,
      },
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
)

// Index pour améliorer les performances
budgetSchema.index({ userId: 1 })
budgetSchema.index({ categoryId: 1 })
budgetSchema.index({ userId: 1, isActive: 1 })
budgetSchema.index({ startDate: 1, endDate: 1 })
budgetSchema.index({ userId: 1, period: 1 })

// Index unique pour éviter les doublons
budgetSchema.index({ userId: 1, categoryId: 1, startDate: 1 }, { unique: true })

// Virtual pour le pourcentage utilisé
budgetSchema.virtual("percentageUsed").get(function () {
  return this.amount > 0 ? Math.round((this.spent / this.amount) * 100) : 0
})

// Virtual pour le montant restant
budgetSchema.virtual("remaining").get(function () {
  return Math.max(0, this.amount - this.spent)
})

// Virtual pour le statut du budget
budgetSchema.virtual("status").get(function () {
  const percentage = this.percentageUsed
  if (percentage >= 100) return "exceeded"
  if (percentage >= this.alertThreshold) return "warning"
  return "on_track"
})

// Virtual pour le montant formaté
budgetSchema.virtual("formattedAmount").get(function () {
  return new Intl.NumberFormat("fr-SN", {
    style: "currency",
    currency: "XOF",
  }).format(this.amount)
})

// Virtual pour le montant dépensé formaté
budgetSchema.virtual("formattedSpent").get(function () {
  return new Intl.NumberFormat("fr-SN", {
    style: "currency",
    currency: "XOF",
  }).format(this.spent)
})

// Virtual pour le montant restant formaté
budgetSchema.virtual("formattedRemaining").get(function () {
  return new Intl.NumberFormat("fr-SN", {
    style: "currency",
    currency: "XOF",
  }).format(this.remaining)
})

// Validation personnalisée pour les dates
budgetSchema.pre("save", function (next) {
  if (this.startDate >= this.endDate) {
    return next(new Error("La date de fin doit être postérieure à la date de début"))
  }
  next()
})

// Méthode pour mettre à jour le montant dépensé
budgetSchema.methods.updateSpent = async function () {
  const Transaction = mongoose.model("Transaction")

  const result = await Transaction.aggregate([
    {
      $match: {
        userId: this.userId,
        categoryId: this.categoryId,
        type: "expense",
        status: "completed",
        date: {
          $gte: this.startDate,
          $lte: this.endDate,
        },
      },
    },
    {
      $group: {
        _id: null,
        total: { $sum: "$amount" },
      },
    },
  ])

  this.spent = result[0]?.total || 0
  return await this.save()
}

// Méthode pour vérifier si une alerte doit être envoyée
budgetSchema.methods.shouldSendAlert = function () {
  if (!this.notifications.enabled) return false

  const percentage = this.percentageUsed
  if (percentage < this.alertThreshold) return false

  // Vérifier si une alerte a déjà été envoyée récemment (dans les dernières 24h)
  if (this.notifications.lastSent) {
    const daysSinceLastAlert = (Date.now() - this.notifications.lastSent) / (1000 * 60 * 60 * 24)
    if (daysSinceLastAlert < 1) return false
  }

  return true
}

// Méthode statique pour obtenir les budgets actifs d'un utilisateur
budgetSchema.statics.getActiveBudgets = async function (userId) {
  const now = new Date()
  return await this.find({
    userId: mongoose.Types.ObjectId(userId),
    isActive: true,
    startDate: { $lte: now },
    endDate: { $gte: now },
  })
    .populate("categoryId", "name color icon")
    .sort({ createdAt: -1 })
}

// Méthode statique pour obtenir les statistiques des budgets
budgetSchema.statics.getBudgetStats = async function (userId) {
  const stats = await this.aggregate([
    {
      $match: {
        userId: mongoose.Types.ObjectId(userId),
        isActive: true,
        startDate: { $lte: new Date() },
        endDate: { $gte: new Date() },
      },
    },
    {
      $group: {
        _id: null,
        totalBudgets: { $sum: 1 },
        totalAmount: { $sum: "$amount" },
        totalSpent: { $sum: "$spent" },
        avgPercentageUsed: { $avg: { $multiply: [{ $divide: ["$spent", "$amount"] }, 100] } },
      },
    },
    {
      $project: {
        _id: 0,
        totalBudgets: 1,
        totalAmount: 1,
        totalSpent: 1,
        totalRemaining: { $subtract: ["$totalAmount", "$totalSpent"] },
        avgPercentageUsed: { $round: ["$avgPercentageUsed", 1] },
      },
    },
  ])

  return (
    stats[0] || {
      totalBudgets: 0,
      totalAmount: 0,
      totalSpent: 0,
      totalRemaining: 0,
      avgPercentageUsed: 0,
    }
  )
}

// Méthode statique pour créer un budget automatique basé sur l'historique
budgetSchema.statics.createAutoBudget = async (userId, categoryId, period = "monthly") => {
  const Transaction = mongoose.model("Transaction")

  // Calculer la moyenne des dépenses des 3 derniers mois
  const threeMonthsAgo = new Date()
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3)

  const avgSpending = await Transaction.aggregate([
    {
      $match: {
        userId: mongoose.Types.ObjectId(userId),
        categoryId: mongoose.Types.ObjectId(categoryId),
        type: "expense",
        status: "completed",
        date: { $gte: threeMonthsAgo },
      },
    },
    {
      $group: {
        _id: null,
        avgAmount: { $avg: "$amount" },
      },
    },
  ])

  const suggestedAmount = avgSpending[0]?.avgAmount || 0

  // Ajouter une marge de 20%
  return Math.round(suggestedAmount * 1.2)
}

module.exports = mongoose.model("Budget", budgetSchema)
