const mongoose = require("mongoose")

const goalSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "L'ID utilisateur est requis"],
    },
    name: {
      type: String,
      required: [true, "Le nom de l'objectif est requis"],
      trim: true,
      maxlength: [200, "Le nom ne peut pas dépasser 200 caractères"],
    },
    description: {
      type: String,
      maxlength: [1000, "La description ne peut pas dépasser 1000 caractères"],
    },
    targetAmount: {
      type: Number,
      required: [true, "Le montant cible est requis"],
      min: [0.01, "Le montant cible doit être supérieur à 0"],
    },
    currentAmount: {
      type: Number,
      default: 0,
      min: [0, "Le montant actuel ne peut pas être négatif"],
    },
    targetDate: {
      type: Date,
      required: [true, "La date cible est requise"],
    },
    category: {
      type: String,
      required: [true, "La catégorie est requise"],
      enum: [
        "emergency_fund",
        "vacation",
        "house",
        "car",
        "education",
        "retirement",
        "wedding",
        "business",
        "electronics",
        "health",
        "other",
      ],
    },
    priority: {
      type: String,
      enum: ["low", "medium", "high"],
      default: "medium",
    },
    status: {
      type: String,
      enum: ["active", "completed", "paused", "cancelled"],
      default: "active",
    },
    color: {
      type: String,
      default: "#3B82F6",
      match: [/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/, "Format de couleur invalide"],
    },
    icon: {
      type: String,
      default: "Target",
    },
    autoSave: {
      enabled: {
        type: Boolean,
        default: false,
      },
      amount: {
        type: Number,
        min: [0, "Le montant d'épargne automatique doit être positif"],
      },
      frequency: {
        type: String,
        enum: ["daily", "weekly", "monthly"],
        default: "monthly",
      },
      nextDate: {
        type: Date,
      },
    },
    milestones: [
      {
        name: {
          type: String,
          required: true,
          maxlength: [100, "Le nom du jalon ne peut pas dépasser 100 caractères"],
        },
        amount: {
          type: Number,
          required: true,
          min: [0.01, "Le montant du jalon doit être supérieur à 0"],
        },
        achieved: {
          type: Boolean,
          default: false,
        },
        achievedDate: {
          type: Date,
        },
        reward: {
          type: String,
          maxlength: [200, "La récompense ne peut pas dépasser 200 caractères"],
        },
      },
    ],
    contributions: [
      {
        amount: {
          type: Number,
          required: true,
          min: [0.01, "Le montant de la contribution doit être supérieur à 0"],
        },
        date: {
          type: Date,
          default: Date.now,
        },
        note: {
          type: String,
          maxlength: [500, "La note ne peut pas dépasser 500 caractères"],
        },
        source: {
          type: String,
          enum: ["manual", "auto_save", "bonus", "transfer"],
          default: "manual",
        },
      },
    ],
    notifications: {
      enabled: {
        type: Boolean,
        default: true,
      },
      frequency: {
        type: String,
        enum: ["daily", "weekly", "monthly"],
        default: "weekly",
      },
      lastSent: {
        type: Date,
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
goalSchema.index({ userId: 1 })
goalSchema.index({ status: 1 })
goalSchema.index({ userId: 1, status: 1 })
goalSchema.index({ targetDate: 1 })
goalSchema.index({ category: 1 })
goalSchema.index({ priority: 1 })

// Virtual pour le pourcentage de progression
goalSchema.virtual("progressPercentage").get(function () {
  return this.targetAmount > 0 ? Math.round((this.currentAmount / this.targetAmount) * 100) : 0
})

// Virtual pour le montant restant
goalSchema.virtual("remainingAmount").get(function () {
  return Math.max(0, this.targetAmount - this.currentAmount)
})

// Virtual pour les jours restants
goalSchema.virtual("daysRemaining").get(function () {
  const now = new Date()
  const diffTime = this.targetDate - now
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24))
})

// Virtual pour le montant quotidien nécessaire
goalSchema.virtual("dailyAmountNeeded").get(function () {
  const daysRemaining = this.daysRemaining
  if (daysRemaining <= 0) return 0
  return Math.round(this.remainingAmount / daysRemaining)
})

// Virtual pour le statut de progression
goalSchema.virtual("progressStatus").get(function () {
  const percentage = this.progressPercentage
  const daysRemaining = this.daysRemaining

  if (percentage >= 100) return "completed"
  if (daysRemaining < 0) return "overdue"
  if (daysRemaining <= 30 && percentage < 80) return "at_risk"
  if (percentage >= 75) return "on_track"
  return "behind"
})

// Virtual pour la catégorie en français
goalSchema.virtual("categoryLabel").get(function () {
  const categories = {
    emergency_fund: "Fonds d'urgence",
    vacation: "Vacances",
    house: "Maison",
    car: "Voiture",
    education: "Éducation",
    retirement: "Retraite",
    wedding: "Mariage",
    business: "Entreprise",
    electronics: "Électronique",
    health: "Santé",
    other: "Autre",
  }
  return categories[this.category] || this.category
})

// Virtual pour le montant formaté
goalSchema.virtual("formattedTargetAmount").get(function () {
  return new Intl.NumberFormat("fr-SN", {
    style: "currency",
    currency: "XOF",
  }).format(this.targetAmount)
})

// Virtual pour le montant actuel formaté
goalSchema.virtual("formattedCurrentAmount").get(function () {
  return new Intl.NumberFormat("fr-SN", {
    style: "currency",
    currency: "XOF",
  }).format(this.currentAmount)
})

// Middleware pour valider la date cible
goalSchema.pre("save", function (next) {
  if (this.targetDate <= new Date()) {
    return next(new Error("La date cible doit être dans le futur"))
  }
  next()
})

// Middleware pour mettre à jour le statut automatiquement
goalSchema.pre("save", function (next) {
  if (this.currentAmount >= this.targetAmount && this.status === "active") {
    this.status = "completed"
  }
  next()
})

// Méthode pour ajouter une contribution
goalSchema.methods.addContribution = async function (amount, note = "", source = "manual") {
  this.contributions.push({
    amount,
    note,
    source,
    date: new Date(),
  })

  this.currentAmount += amount

  // Vérifier les jalons
  this.milestones.forEach((milestone) => {
    if (!milestone.achieved && this.currentAmount >= milestone.amount) {
      milestone.achieved = true
      milestone.achievedDate = new Date()
    }
  })

  return await this.save()
}

// Méthode pour calculer la prochaine épargne automatique
goalSchema.methods.calculateNextAutoSave = function () {
  if (!this.autoSave.enabled) return null

  const now = new Date()
  const nextDate = new Date(this.autoSave.nextDate || now)

  switch (this.autoSave.frequency) {
    case "daily":
      nextDate.setDate(nextDate.getDate() + 1)
      break
    case "weekly":
      nextDate.setDate(nextDate.getDate() + 7)
      break
    case "monthly":
      nextDate.setMonth(nextDate.getMonth() + 1)
      break
  }

  return nextDate
}

// Méthode statique pour obtenir les objectifs actifs d'un utilisateur
goalSchema.statics.getActiveGoals = async function (userId) {
  return await this.find({
    userId: mongoose.Types.ObjectId(userId),
    status: "active",
  }).sort({ priority: -1, targetDate: 1 })
}

// Méthode statique pour obtenir les statistiques des objectifs
goalSchema.statics.getGoalStats = async function (userId) {
  const stats = await this.aggregate([
    { $match: { userId: mongoose.Types.ObjectId(userId) } },
    {
      $group: {
        _id: "$status",
        count: { $sum: 1 },
        totalTarget: { $sum: "$targetAmount" },
        totalCurrent: { $sum: "$currentAmount" },
      },
    },
  ])

  const result = {
    active: { count: 0, totalTarget: 0, totalCurrent: 0 },
    completed: { count: 0, totalTarget: 0, totalCurrent: 0 },
    paused: { count: 0, totalTarget: 0, totalCurrent: 0 },
    cancelled: { count: 0, totalTarget: 0, totalCurrent: 0 },
  }

  stats.forEach((stat) => {
    if (result[stat._id]) {
      result[stat._id] = {
        count: stat.count,
        totalTarget: stat.totalTarget,
        totalCurrent: stat.totalCurrent,
      }
    }
  })

  return result
}

// Méthode statique pour traiter les épargnes automatiques
goalSchema.statics.processAutoSaves = async function () {
  const now = new Date()
  const goalsToProcess = await this.find({
    "autoSave.enabled": true,
    "autoSave.nextDate": { $lte: now },
    status: "active",
  })

  for (const goal of goalsToProcess) {
    try {
      await goal.addContribution(goal.autoSave.amount, "Épargne automatique", "auto_save")
      goal.autoSave.nextDate = goal.calculateNextAutoSave()
      await goal.save()
    } catch (error) {
      console.error(`Erreur lors de l'épargne automatique pour l'objectif ${goal._id}:`, error)
    }
  }

  return goalsToProcess.length
}

module.exports = mongoose.model("Goal", goalSchema)
