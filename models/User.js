const mongoose = require("mongoose")
const bcrypt = require("bcryptjs")

const userSchema = new mongoose.Schema(
  {
    firstName: {
      type: String,
      required: [true, "Le prénom est requis"],
      trim: true,
      maxlength: [50, "Le prénom ne peut pas dépasser 50 caractères"],
      minlength: [2, "Le prénom doit contenir au moins 2 caractères"],
    },
    lastName: {
      type: String,
      required: [true, "Le nom est requis"],
      trim: true,
      maxlength: [50, "Le nom ne peut pas dépasser 50 caractères"],
      minlength: [2, "Le nom doit contenir au moins 2 caractères"],
    },
    email: {
      type: String,
      required: [true, "L'email est requis"],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, "Format d'email invalide"],
    },
    phone: {
      type: String,
      required: [true, "Le numéro de téléphone est requis"],
      trim: true,
      match: [/^(\+221|00221)?[0-9]{9}$/, "Format de téléphone sénégalais invalide"],
    },
    password: {
      type: String,
      required: [true, "Le mot de passe est requis"],
      minlength: [8, "Le mot de passe doit contenir au moins 8 caractères"],
      select: false, // Ne pas inclure le mot de passe par défaut dans les requêtes
    },
    city: {
      type: String,
      required: [true, "La ville est requise"],
      enum: [
        "Dakar",
        "Thiès",
        "Kaolack",
        "Saint-Louis",
        "Ziguinchor",
        "Diourbel",
        "Tambacounda",
        "Kolda",
        "Fatick",
        "Kaffrine",
        "Kédougou",
        "Louga",
        "Matam",
        "Sédhiou",
      ],
    },
    profession: {
      type: String,
      required: [true, "La profession est requise"],
      enum: [
        "Fonctionnaire",
        "Commerçant(e)",
        "Enseignant(e)",
        "Étudiant(e)",
        "Entrepreneur",
        "Employé(e) privé",
        "Artisan",
        "Agriculteur",
        "Chauffeur",
        "Infirmier(ère)",
        "Ingénieur",
        "Médecin",
        "Avocat",
        "Autre",
      ],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    lastLogin: {
      type: Date,
    },
    preferences: {
      currency: {
        type: String,
        default: "CFA",
        enum: ["CFA", "EUR", "USD"],
      },
      language: {
        type: String,
        default: "fr",
        enum: ["fr", "en", "wo"],
      },
      notifications: {
        email: { type: Boolean, default: true },
        push: { type: Boolean, default: true },
        budgetAlerts: { type: Boolean, default: true },
        goalReminders: { type: Boolean, default: true },
      },
      theme: {
        type: String,
        default: "light",
        enum: ["light", "dark", "auto"],
      },
    },
    avatar: {
      type: String,
      default: null,
    },
    emailVerified: {
      type: Boolean,
      default: false,
    },
    phoneVerified: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: (doc, ret) => {
        delete ret.password
        return ret
      },
    },
    toObject: {
      virtuals: true,
      transform: (doc, ret) => {
        delete ret.password
        return ret
      },
    },
  },
)

// Index pour améliorer les performances
userSchema.index({ email: 1 })
userSchema.index({ createdAt: -1 })
userSchema.index({ city: 1 })
userSchema.index({ profession: 1 })
userSchema.index({ isActive: 1 })

// Virtual pour le nom complet
userSchema.virtual("fullName").get(function () {
  return `${this.firstName} ${this.lastName}`
})

// Virtual pour l'initiales
userSchema.virtual("initials").get(function () {
  return `${this.firstName.charAt(0)}${this.lastName.charAt(0)}`.toUpperCase()
})

// Middleware pour hasher le mot de passe avant sauvegarde
userSchema.pre("save", async function (next) {
  // Ne hasher que si le mot de passe a été modifié
  if (!this.isModified("password")) return next()

  try {
    // Hasher le mot de passe avec un coût de 12
    const salt = await bcrypt.genSalt(12)
    this.password = await bcrypt.hash(this.password, salt)
    next()
  } catch (error) {
    next(error)
  }
})

// Middleware pour mettre à jour lastLogin
userSchema.pre("save", function (next) {
  if (this.isNew) {
    this.lastLogin = new Date()
  }
  next()
})

// Méthode pour comparer les mots de passe
userSchema.methods.comparePassword = async function (candidatePassword) {
  try {
    return await bcrypt.compare(candidatePassword, this.password)
  } catch (error) {
    throw new Error("Erreur lors de la comparaison du mot de passe")
  }
}

// Méthode pour obtenir les données publiques de l'utilisateur
userSchema.methods.getPublicProfile = function () {
  const userObject = this.toObject()
  delete userObject.password
  return userObject
}

// Méthode pour vérifier si l'utilisateur peut se connecter
userSchema.methods.canLogin = function () {
  return this.isActive && !this.isDeleted
}

// Méthode statique pour trouver par email
userSchema.statics.findByEmail = function (email) {
  return this.findOne({ email: email.toLowerCase() })
}

// Méthode statique pour les statistiques
userSchema.statics.getStats = async function () {
  const stats = await this.aggregate([
    {
      $group: {
        _id: null,
        totalUsers: { $sum: 1 },
        activeUsers: { $sum: { $cond: ["$isActive", 1, 0] } },
        verifiedUsers: { $sum: { $cond: ["$emailVerified", 1, 0] } },
      },
    },
    {
      $project: {
        _id: 0,
        totalUsers: 1,
        activeUsers: 1,
        verifiedUsers: 1,
        inactiveUsers: { $subtract: ["$totalUsers", "$activeUsers"] },
      },
    },
  ])

  return stats[0] || { totalUsers: 0, activeUsers: 0, verifiedUsers: 0, inactiveUsers: 0 }
}

module.exports = mongoose.model("User", userSchema)
