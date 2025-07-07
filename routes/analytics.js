const express = require("express")
const Transaction = require("../models/Transaction")
const Budget = require("../models/Budget")
const auth = require("../middleware/auth")

const router = express.Router()

// @route   GET /api/analytics
// @desc    Obtenir les données d'analyse financière
// @access  Private
router.get("/", auth, async (req, res) => {
  try {
    const { period = "6months" } = req.query

    // Calculer les dates selon la période
    const endDate = new Date()
    const startDate = new Date()

    switch (period) {
      case "1month":
        startDate.setMonth(startDate.getMonth() - 1)
        break
      case "3months":
        startDate.setMonth(startDate.getMonth() - 3)
        break
      case "6months":
        startDate.setMonth(startDate.getMonth() - 6)
        break
      case "1year":
        startDate.setFullYear(startDate.getFullYear() - 1)
        break
    }

    // Données mensuelles
    const monthlyData = await Transaction.aggregate([
      {
        $match: {
          userId: req.user._id,
          date: { $gte: startDate, $lte: endDate },
        },
      },
      {
        $group: {
          _id: {
            year: { $year: "$date" },
            month: { $month: "$date" },
          },
          income: {
            $sum: { $cond: [{ $gt: ["$amount", 0] }, "$amount", 0] },
          },
          expenses: {
            $sum: { $cond: [{ $lt: ["$amount", 0] }, { $abs: "$amount" }, 0] },
          },
        },
      },
      {
        $project: {
          month: {
            $concat: [
              { $toString: "$_id.year" },
              "-",
              {
                $cond: [
                  { $lt: ["$_id.month", 10] },
                  { $concat: ["0", { $toString: "$_id.month" }] },
                  { $toString: "$_id.month" },
                ],
              },
            ],
          },
          income: 1,
          expenses: 1,
        },
      },
      { $sort: { month: 1 } },
    ])

    // Dépenses par catégorie
    const categoryExpenses = await Transaction.aggregate([
      {
        $match: {
          userId: req.user._id,
          amount: { $lt: 0 },
          date: { $gte: startDate, $lte: endDate },
        },
      },
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
        $group: {
          _id: "$categoryId",
          category: { $first: "$category.name" },
          color: { $first: "$category.color" },
          amount: { $sum: { $abs: "$amount" } },
        },
      },
      {
        $lookup: {
          from: "transactions",
          let: { userId: req.user._id, startDate, endDate },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$userId", "$$userId"] },
                    { $lt: ["$amount", 0] },
                    { $gte: ["$date", "$$startDate"] },
                    { $lte: ["$date", "$$endDate"] },
                  ],
                },
              },
            },
            {
              $group: {
                _id: null,
                total: { $sum: { $abs: "$amount" } },
              },
            },
          ],
          as: "totalExpenses",
        },
      },
      {
        $addFields: {
          percentage: {
            $round: [
              {
                $multiply: [
                  {
                    $divide: ["$amount", { $ifNull: [{ $arrayElemAt: ["$totalExpenses.total", 0] }, 1] }],
                  },
                  100,
                ],
              },
              1,
            ],
          },
        },
      },
      { $sort: { amount: -1 } },
    ])

    // Statistiques générales
    const stats = await Transaction.aggregate([
      {
        $match: {
          userId: req.user._id,
          date: { $gte: startDate, $lte: endDate },
        },
      },
      {
        $group: {
          _id: null,
          avgIncome: {
            $avg: { $cond: [{ $gt: ["$amount", 0] }, "$amount", null] },
          },
          avgExpenses: {
            $avg: { $cond: [{ $lt: ["$amount", 0] }, { $abs: "$amount" }, null] },
          },
          totalIncome: {
            $sum: { $cond: [{ $gt: ["$amount", 0] }, "$amount", 0] },
          },
          totalExpenses: {
            $sum: { $cond: [{ $lt: ["$amount", 0] }, { $abs: "$amount" }, 0] },
          },
        },
      },
    ])

    // Insights automatiques
    const insights = []

    // Vérifier les dépassements de budget
    const budgetOverruns = await Budget.aggregate([
      {
        $match: {
          userId: req.user._id,
          isActive: true,
        },
      },
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
                    { $lt: ["$amount", 0] },
                    { $gte: ["$date", "$$startDate"] },
                    { $lte: ["$date", "$$endDate"] },
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
        $match: {
          $expr: { $gt: ["$spent", "$amount"] },
        },
      },
    ])

    budgetOverruns.forEach((overrun) => {
      insights.push({
        type: "warning",
        title: `Dépassement budget ${overrun.category.name}`,
        description: `Vous avez dépassé votre budget ${overrun.category.name} de ${(overrun.spent - overrun.amount).toLocaleString()} CFA`,
        icon: "AlertTriangle",
        color: "text-orange-600",
      })
    })

    res.json({
      success: true,
      data: {
        monthlyData,
        categoryExpenses,
        stats: stats[0] || {
          avgIncome: 0,
          avgExpenses: 0,
          totalIncome: 0,
          totalExpenses: 0,
        },
        insights,
        period,
      },
    })
  } catch (error) {
    console.error("Erreur lors de la récupération des analyses:", error)
    res.status(500).json({
      success: false,
      error: "Erreur lors de la récupération des analyses",
    })
  }
})

module.exports = router
