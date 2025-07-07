const express = require("express")
const Budget = require("../models/Budget")
const Category = require("../models/Category")
const Transaction = require("../models/Transaction")
const auth = require("../middleware/auth")
const { validateBudget } = require("../middleware/validation")

const router = express.Router()

// @route   GET /api/budgets
// @desc    Obtenir les budgets de l'utilisateur
// @access  Private
router.get("/", auth, async (req, res) => {
  try {
    const { period, isActive = true } = req.query

    const filter = { userId: req.user._id }
    if (isActive !== "all") {
      filter.isActive = isActive === "true"
    }
    if (period) {
      filter.period = period
    }

    const budgets = await Budget.aggregate([
      { $match: filter },
      {
        $lookup: {
          from: "categories",
          localField: "categoryId",
          foreignField: "_id",
          as: "category",
        },
      },
      {
        $unwind: "$category",
      },
      {
        $lookup: {
          from: "transactions",
          let: { categoryId: "$categoryId", startDate: "$startDate", endDate: "$endDate", userId: "$userId" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$categoryId", "$$categoryId"] },
                    { $eq: ["$userId", "$$userId"] },
                    { $gte: ["$date", "$$startDate"] },
                    { $lte: ["$date", "$$endDate"] },
                    { $lt: ["$amount", 0] },
                  ],
                },
              },
            },
          ],
          as: "transactions",
        },
      },
      {
        $addFields: {
          spent: {
            $sum: {
              $map: {
                input: "$transactions",
                as: "transaction",
                in: { $abs: "$$transaction.amount" },
              },
            },
          },
        },
      },
      {
        $project: {
          _id: 1,
          amount: 1,
          period: 1,
          startDate: 1,
          endDate: 1,
          spent: 1,
          isActive: 1,
          alertThreshold: 1,
          notes: 1,
          createdAt: 1,
          category: {
            _id: "$category._id",
            name: "$category.name",
            color: "$category.color",
            icon: "$category.icon",
          },
        },
      },
      { $sort: { "category.name": 1 } },
    ])

    res.json({
      success: true,
      data: budgets,
    })
  } catch (error) {
    console.error("Erreur lors de la récupération des budgets:", error)
    res.status(500).json({
      success: false,
      error: "Erreur lors de la récupération des budgets",
    })
  }
})

// @route   POST /api/budgets
// @desc    Créer un nouveau budget
// @access  Private
router.post("/", auth, validateBudget, async (req, res) => {
  try {
    const { categoryId, amount, period, startDate, endDate, alertThreshold, notes } = req.body

    // Vérifier que la catégorie existe
    const category = await Category.findById(categoryId)
    if (!category) {
      return res.status(404).json({
        success: false,
        error: "Catégorie non trouvée",
      })
    }

    // Vérifier qu'il n'y a pas déjà un budget actif pour cette catégorie et période
    const existingBudget = await Budget.findOne({
      userId: req.user._id,
      categoryId,
      isActive: true,
      $or: [
        {
          startDate: { $lte: new Date(endDate) },
          endDate: { $gte: new Date(startDate) },
        },
      ],
    })

    if (existingBudget) {
      return res.status(400).json({
        success: false,
        error: "Un budget actif existe déjà pour cette catégorie sur cette période",
      })
    }

    // Créer le budget
    const budget = new Budget({
      userId: req.user._id,
      categoryId,
      amount: Number.parseFloat(amount),
      period,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      alertThreshold: alertThreshold || 80,
      notes,
    })

    await budget.save()

    // Calculer le montant déjà dépensé
    await budget.updateSpent()

    // Récupérer le budget avec les données de catégorie
    const populatedBudget = await Budget.findById(budget._id).populate("categoryId", "name color icon")

    res.status(201).json({
      success: true,
      message: "Budget créé avec succès",
      data: populatedBudget,
    })
  } catch (error) {
    console.error("Erreur lors de la création du budget:", error)
    res.status(500).json({
      success: false,
      error: "Erreur lors de la création du budget",
    })
  }
})

// @route   GET /api/budgets/:id
// @desc    Obtenir un budget spécifique
// @access  Private
router.get("/:id", auth, async (req, res) => {
  try {
    const budget = await Budget.findOne({
      _id: req.params.id,
      userId: req.user._id,
    }).populate("categoryId", "name color icon")

    if (!budget) {
      return res.status(404).json({
        success: false,
        error: "Budget non trouvé",
      })
    }

    // Mettre à jour le montant dépensé
    await budget.updateSpent()

    res.json({
      success: true,
      data: budget,
    })
  } catch (error) {
    console.error("Erreur lors de la récupération du budget:", error)
    res.status(500).json({
      success: false,
      error: "Erreur lors de la récupération du budget",
    })
  }
})

// @route   PUT /api/budgets/:id
// @desc    Mettre à jour un budget
// @access  Private
router.put("/:id", auth, validateBudget, async (req, res) => {
  try {
    const { amount, period, startDate, endDate, alertThreshold, notes, isActive } = req.body

    const budget = await Budget.findOne({
      _id: req.params.id,
      userId: req.user._id,
    })

    if (!budget) {
      return res.status(404).json({
        success: false,
        error: "Budget non trouvé",
      })
    }

    // Mettre à jour les champs
    budget.amount = Number.parseFloat(amount)
    budget.period = period
    budget.startDate = new Date(startDate)
    budget.endDate = new Date(endDate)
    budget.alertThreshold = alertThreshold || budget.alertThreshold
    budget.notes = notes
    if (isActive !== undefined) {
      budget.isActive = isActive
    }

    await budget.save()

    // Recalculer le montant dépensé
    await budget.updateSpent()

    const updatedBudget = await Budget.findById(budget._id).populate("categoryId", "name color icon")

    res.json({
      success: true,
      message: "Budget mis à jour avec succès",
      data: updatedBudget,
    })
  } catch (error) {
    console.error("Erreur lors de la mise à jour du budget:", error)
    res.status(500).json({
      success: false,
      error: "Erreur lors de la mise à jour du budget",
    })
  }
})

// @route   DELETE /api/budgets/:id
// @desc    Supprimer un budget
// @access  Private
router.delete("/:id", auth, async (req, res) => {
  try {
    const budget = await Budget.findOneAndDelete({
      _id: req.params.id,
      userId: req.user._id,
    })

    if (!budget) {
      return res.status(404).json({
        success: false,
        error: "Budget non trouvé",
      })
    }

    res.json({
      success: true,
      message: "Budget supprimé avec succès",
    })
  } catch (error) {
    console.error("Erreur lors de la suppression du budget:", error)
    res.status(500).json({
      success: false,
      error: "Erreur lors de la suppression du budget",
    })
  }
})

// @route   POST /api/budgets/:id/refresh
// @desc    Actualiser le montant dépensé d'un budget
// @access  Private
router.post("/:id/refresh", auth, async (req, res) => {
  try {
    const budget = await Budget.findOne({
      _id: req.params.id,
      userId: req.user._id,
    })

    if (!budget) {
      return res.status(404).json({
        success: false,
        error: "Budget non trouvé",
      })
    }

    const spent = await budget.updateSpent()

    res.json({
      success: true,
      message: "Montant dépensé actualisé",
      data: { spent },
    })
  } catch (error) {
    console.error("Erreur lors de l'actualisation du budget:", error)
    res.status(500).json({
      success: false,
      error: "Erreur lors de l'actualisation du budget",
    })
  }
})

module.exports = router
