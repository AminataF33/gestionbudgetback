const express = require("express")
const Category = require("../models/Category")
const auth = require("../middleware/auth")

const router = express.Router()

// @route   GET /api/categories
// @desc    Obtenir les catégories (par défaut + utilisateur)
// @access  Private
router.get("/", auth, async (req, res) => {
  try {
    const { type } = req.query

    const filter = {
      $or: [{ isDefault: true }, { userId: req.user._id }],
      isActive: true,
    }

    if (type) {
      filter.type = type
    }

    const categories = await Category.find(filter).sort({ isDefault: -1, name: 1 })

    res.json({
      success: true,
      data: categories,
    })
  } catch (error) {
    console.error("Erreur lors de la récupération des catégories:", error)
    res.status(500).json({
      success: false,
      error: "Erreur lors de la récupération des catégories",
    })
  }
})

// @route   POST /api/categories
// @desc    Créer une nouvelle catégorie personnalisée
// @access  Private
router.post("/", auth, async (req, res) => {
  try {
    const { name, type, color, icon, description } = req.body

    // Vérifier si une catégorie avec ce nom existe déjà pour cet utilisateur
    const existingCategory = await Category.findOne({
      name,
      userId: req.user._id,
      type,
    })

    if (existingCategory) {
      return res.status(400).json({
        success: false,
        error: "Une catégorie avec ce nom existe déjà",
      })
    }

    const category = new Category({
      name,
      type,
      color,
      icon: icon || "Circle",
      description,
      userId: req.user._id,
    })

    await category.save()

    res.status(201).json({
      success: true,
      message: "Catégorie créée avec succès",
      data: category,
    })
  } catch (error) {
    console.error("Erreur lors de la création de la catégorie:", error)
    res.status(500).json({
      success: false,
      error: "Erreur lors de la création de la catégorie",
    })
  }
})

module.exports = router
