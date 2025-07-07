const mongoose = require("mongoose")

const categorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Le nom de la catégorie est requis"],
      trim: true,
      maxlength: [100, "Le nom ne peut pas dépasser 100 caractères"],
    },
    type: {
      type: String,
      required: [true, "Le type de catégorie est requis"],
      enum: ["income", "expense"],
    },
    color: {
      type: String,
      required: [true, "La couleur est requise"],
      match: [/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/, "Format de couleur invalide"],
    },
    icon: {
      type: String,
      required: [true, "L'icône est requise"],
      default: "Tag",
    },
    description: {
      type: String,
      maxlength: [500, "La description ne peut pas dépasser 500 caractères"],
    },
    isDefault: {
      type: Boolean,
      default: false,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null, // null pour les catégories par défaut
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    parentCategory: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      default: null,
    },
    order: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
)

// Index pour améliorer les performances
categorySchema.index({ type: 1 })
categorySchema.index({ userId: 1 })
categorySchema.index({ isDefault: 1 })
categorySchema.index({ isActive: 1 })
categorySchema.index({ type: 1, userId: 1 })
categorySchema.index({ type: 1, isDefault: 1 })

// Index composé pour éviter les doublons
categorySchema.index({ name: 1, type: 1, userId: 1 }, { unique: true })

// Virtual pour les sous-catégories
categorySchema.virtual("subcategories", {
  ref: "Category",
  localField: "_id",
  foreignField: "parentCategory",
})

// Méthode statique pour obtenir les catégories d'un utilisateur
categorySchema.statics.getUserCategories = async function (userId, type = null) {
  const query = {
    $or: [{ userId: userId }, { isDefault: true }],
    isActive: true,
  }

  if (type) {
    query.type = type
  }

  return await this.find(query).sort({ order: 1, name: 1 })
}

// Méthode statique pour créer les catégories par défaut
categorySchema.statics.createDefaultCategories = async function () {
  const defaultCategories = [
    // Catégories de revenus
    { name: "Salaire", type: "income", color: "#10B981", icon: "Banknote", isDefault: true },
    { name: "Freelance", type: "income", color: "#059669", icon: "Laptop", isDefault: true },
    { name: "Investissements", type: "income", color: "#047857", icon: "TrendingUp", isDefault: true },
    { name: "Autres revenus", type: "income", color: "#065F46", icon: "Plus", isDefault: true },

    // Catégories de dépenses
    { name: "Alimentation", type: "expense", color: "#EF4444", icon: "UtensilsCrossed", isDefault: true },
    { name: "Transport", type: "expense", color: "#F97316", icon: "Car", isDefault: true },
    { name: "Logement", type: "expense", color: "#EAB308", icon: "Home", isDefault: true },
    { name: "Santé", type: "expense", color: "#EC4899", icon: "Heart", isDefault: true },
    { name: "Éducation", type: "expense", color: "#8B5CF6", icon: "GraduationCap", isDefault: true },
    { name: "Loisirs", type: "expense", color: "#06B6D4", icon: "Gamepad2", isDefault: true },
    { name: "Shopping", type: "expense", color: "#84CC16", icon: "ShoppingBag", isDefault: true },
    { name: "Factures", type: "expense", color: "#6366F1", icon: "Receipt", isDefault: true },
    { name: "Autres dépenses", type: "expense", color: "#64748B", icon: "MoreHorizontal", isDefault: true },
  ]

  for (const category of defaultCategories) {
    await this.findOneAndUpdate({ name: category.name, type: category.type, isDefault: true }, category, {
      upsert: true,
      new: true,
    })
  }

  console.log("✅ Catégories par défaut créées")
}

// Méthode pour vérifier si une catégorie peut être supprimée
categorySchema.methods.canBeDeleted = async function () {
  if (this.isDefault) {
    return false
  }

  // Vérifier s'il y a des transactions liées
  const Transaction = mongoose.model("Transaction")
  const transactionCount = await Transaction.countDocuments({ categoryId: this._id })

  return transactionCount === 0
}

module.exports = mongoose.model("Category", categorySchema)
