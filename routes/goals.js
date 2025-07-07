const express = require("express")
const Goal = require("../models/Goal")
const { auth } = require("../middleware/auth");
const { validateGoal } = require("../middleware/validation")

const router = express.Router()

// @route   GET /api/goals
// @desc    Obtenir les objectifs de l'utilisateur
// @access  Private
router.get("/", auth, async (req, res) => {
  try {
    const { isActive = true, category, status } = req.query

    const filter = { userId: req.user._id }

    if (isActive !== "all") {
      filter.isActive = isActive === "true"
    }

    if (category && category !== "all") {
      filter.category = category
    }

    let goals = await Goal.find(filter).sort({ deadline: 1, createdAt: -1 })

    // Filtrer par statut si spécifié
    if (status && status !== "all") {
      goals = goals.filter((goal) => goal.status === status)
    }

    res.json({
      success: true,
      data: goals,
    })
  } catch (error) {
    console.error("Erreur lors de la récupération des objectifs:", error)
    res.status(500).json({
      success: false,
      error: "Erreur lors de la récupération des objectifs",
    })
  }
})

// @route   POST /api/goals
// @desc    Créer un nouvel objectif
// @access  Private
router.post("/", auth, validateGoal, async (req, res) => {
  try {
    const {
      title,
      description,
      targetAmount,
      currentAmount = 0,
      deadline,
      category,
      priority = "medium",
      linkedAccountId,
      autoSave,
      milestones,
    } = req.body

    const goal = new Goal({
      userId: req.user._id,
      title,
      description,
      targetAmount: Number.parseFloat(targetAmount),
      currentAmount: Number.parseFloat(currentAmount),
      deadline: new Date(deadline),
      category,
      priority,
      linkedAccountId,
      autoSave,
      milestones: milestones || [],
    })

    await goal.save()

    res.status(201).json({
      success: true,
      message: "Objectif créé avec succès",
      data: goal,
    })
  } catch (error) {
    console.error("Erreur lors de la création de l'objectif:", error)
    res.status(500).json({
      success: false,
      error: "Erreur lors de la création de l'objectif",
    })
  }
})

// @route   GET /api/goals/:id
// @desc    Obtenir un objectif spécifique
// @access  Private
router.get("/:id", auth, async (req, res) => {
  try {
    const goal = await Goal.findOne({
      _id: req.params.id,
      userId: req.user._id,
    }).populate("linkedAccountId", "name bank type")

    if (!goal) {
      return res.status(404).json({
        success: false,
        error: "Objectif non trouvé",
      })
    }

    res.json({
      success: true,
      data: goal,
    })
  } catch (error) {
    console.error("Erreur lors de la récupération de l'objectif:", error)
    res.status(500).json({
      success: false,
      error: "Erreur lors de la récupération de l'objectif",
    })
  }
})

// @route   PUT /api/goals/:id
// @desc    Mettre à jour un objectif
// @access  Private
router.put("/:id", auth, validateGoal, async (req, res) => {
  try {
    const {
      title,
      description,
      targetAmount,
      currentAmount,
      deadline,
      category,
      priority,
      isActive,
      linkedAccountId,
      autoSave,
      milestones,
    } = req.body

    const goal = await Goal.findOne({
      _id: req.params.id,
      userId: req.user._id,
    })

    if (!goal) {
      return res.status(404).json({
        success: false,
        error: "Objectif non trouvé",
      })
    }

    // Mettre à jour les champs
    goal.title = title
    goal.description = description
    goal.targetAmount = Number.parseFloat(targetAmount)
    goal.currentAmount = Number.parseFloat(currentAmount)
    goal.deadline = new Date(deadline)
    goal.category = category
    goal.priority = priority
    goal.linkedAccountId = linkedAccountId
    goal.autoSave = autoSave
    goal.milestones = milestones || goal.milestones

    if (isActive !== undefined) {
      goal.isActive = isActive
    }

    await goal.save()

    res.json({
      success: true,
      message: "Objectif mis à jour avec succès",
      data: goal,
    })
  } catch (error) {
    console.error("Erreur lors de la mise à jour de l'objectif:", error)
    res.status(500).json({
      success: false,
      error: "Erreur lors de la mise à jour de l'objectif",
    })
  }
})

// @route   DELETE /api/goals/:id
// @desc    Supprimer un objectif
// @access  Private
router.delete("/:id", auth, async (req, res) => {
  try {
    const goal = await Goal.findOneAndDelete({
      _id: req.params.id,
      userId: req.user._id,
    })

    if (!goal) {
      return res.status(404).json({
        success: false,
        error: "Objectif non trouvé",
      })
    }

    res.json({
      success: true,
      message: "Objectif supprimé avec succès",
    })
  } catch (error) {
    console.error("Erreur lors de la suppression de l'objectif:", error)
    res.status(500).json({
      success: false,
      error: "Erreur lors de la suppression de l'objectif",
    })
  }
})

// @route   POST /api/goals/:id/add-amount
// @desc    Ajouter un montant à un objectif
// @access  Private
router.post("/:id/add-amount", auth, async (req, res) => {
  try {
    const { amount } = req.body

    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        error: "Le montant doit être positif",
      })
    }

    const goal = await Goal.findOne({
      _id: req.params.id,
      userId: req.user._id,
    })

    if (!goal) {
      return res.status(404).json({
        success: false,
        error: "Objectif non trouvé",
      })
    }

    await goal.addAmount(Number.parseFloat(amount))

    res.json({
      success: true,
      message: "Montant ajouté avec succès",
      data: goal,
    })
  } catch (error) {
    console.error("Erreur lors de l'ajout du montant:", error)
    res.status(500).json({
      success: false,
      error: "Erreur lors de l'ajout du montant",
    })
  }
})

// @route   GET /api/goals/stats/summary
// @desc    Obtenir un résumé des objectifs
// @access  Private
router.get("/stats/summary", auth, async (req, res) => {
  try {
    const stats = await Goal.aggregate([
      {
        $match: {
          userId: req.user._id,
          isActive: true,
        },
      },
      {
        $group: {
          _id: null,
          totalGoals: { $sum: 1 },
          completedGoals: {
            $sum: { $cond: ["$isCompleted", 1, 0] },
          },
          totalTargetAmount: { $sum: "$targetAmount" },
          totalCurrentAmount: { $sum: "$currentAmount" },
          avgProgress: {
            $avg: {
              $multiply: [{ $divide: ["$currentAmount", "$targetAmount"] }, 100],
            },
          },
        },
      },
    ])

    const result = stats[0] || {
      totalGoals: 0,
      completedGoals: 0,
      totalTargetAmount: 0,
      totalCurrentAmount: 0,
      avgProgress: 0,
    }

    // Objectifs par statut
    const goalsByStatus = await Goal.aggregate([
      {
        $match: {
          userId: req.user._id,
          isActive: true,
        },
      },
      {
        $addFields: {
          status: {
            $cond: {
              if: "$isCompleted",
              then: "completed",
              else: {
                $cond: {
                  if: { $lt: ["$deadline", new Date()] },
                  then: "overdue",
                  else: {
                    $cond: {
                      if: {
                        $lte: ["$deadline", { $add: [new Date(), 30 * 24 * 60 * 60 * 1000] }],
                      },
                      then: "urgent",
                      else: "in-progress",
                    },
                  },
                },
              },
            },
          },
        },
      },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
        },
      },
    ])

    const statusCounts = {}
    goalsByStatus.forEach((item) => {
      statusCounts[item._id] = item.count
    })

    res.json({
      success: true,
      data: {
        ...result,
        statusCounts,
      },
    })
  } catch (error) {
    console.error("Erreur lors de la récupération des statistiques d'objectifs:", error)
    res.status(500).json({
      success: false,
      error: "Erreur lors de la récupération des statistiques d'objectifs",
    })
  }
})

module.exports = router
