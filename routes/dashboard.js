const express = require("express")
const User = require("../models/User")
const Account = require("../models/Account")
const Transaction = require("../models/Transaction")
const Budget = require("../models/Budget")
const Goal = require("../models/Goal")
const { auth } = require("../middleware/auth");

const router = express.Router()

// @route   GET /api/dashboard
// @desc    Obtenir les données du tableau de bord
// @access  Private
router.get("/", auth, async (req, res) => {
  try {
    // Récupérer les comptes de l'utilisateur
    const accounts = await Account.find({ userId: req.user._id, isActive: true })
      .select("name bank type balance")
      .sort({ createdAt: 1 })

    // Récupérer les transactions récentes (10 dernières)
    const recentTransactions = await Transaction.find({ userId: req.user._id })
      .populate("categoryId", "name color icon")
      .populate("accountId", "name bank")
      .sort({ date: -1, createdAt: -1 })
      .limit(10)
      .select("description amount date categoryId accountId")

    // Récupérer les budgets actifs avec les dépenses
    const budgets = await Budget.aggregate([
      {
        $match: {
          userId: req.user._id,
          isActive: true,
          startDate: { $lte: new Date() },
          endDate: { $gte: new Date() },
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
          category: "$category.name",
          color: "$category.color",
          budget: "$amount",
          spent: 1,
          period: 1,
          startDate: 1,
          endDate: 1,
        },
      },
    ])

    // Récupérer les objectifs actifs
    const goals = await Goal.find({ userId: req.user._id, isActive: true })
      .sort({ deadline: 1 })
      .limit(5)
      .select("title targetAmount currentAmount deadline category")

    // Calculer les statistiques
    const totalBalance = accounts.reduce((sum, account) => sum + account.balance, 0)

    // Dépenses du mois en cours
    const startOfMonth = new Date()
    startOfMonth.setDate(1)
    startOfMonth.setHours(0, 0, 0, 0)

    const monthlyExpensesResult = await Transaction.aggregate([
      {
        $match: {
          userId: req.user._id,
          date: { $gte: startOfMonth },
          amount: { $lt: 0 },
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: { $abs: "$amount" } },
        },
      },
    ])

    const monthlyExpenses = monthlyExpensesResult[0]?.total || 0

    // Épargne (comptes d'épargne)
    const savings = accounts
      .filter((account) => account.type === "savings")
      .reduce((sum, account) => sum + account.balance, 0)

    const stats = {
      totalBalance,
      monthlyExpenses,
      savings,
    }

    // Formater les données pour le frontend
    const formattedRecentTransactions = recentTransactions.map((transaction) => ({
      id: transaction._id,
      description: transaction.description,
      amount: transaction.amount,
      date: transaction.date.toISOString().split("T")[0],
      category: transaction.categoryId?.name || "Non catégorisé",
      account: transaction.accountId?.name || "Compte supprimé",
    }))

    const formattedAccounts = accounts.map((account) => ({
      id: account._id,
      name: account.name,
      bank: account.bank,
      type: account.type,
      balance: account.balance,
    }))

    res.json({
      success: true,
      data: {
        user: req.user.getPublicProfile(),
        accounts: formattedAccounts,
        recentTransactions: formattedRecentTransactions,
        budgets,
        goals,
        stats,
      },
    })
  } catch (error) {
    console.error("Erreur lors de la récupération du tableau de bord:", error)
    res.status(500).json({
      success: false,
      error: "Erreur lors de la récupération du tableau de bord",
    })
  }
})

// @route   GET /api/dashboard/quick-stats
// @desc    Obtenir des statistiques rapides
// @access  Private
router.get("/quick-stats", auth, async (req, res) => {
  try {
    const { period = "30" } = req.query
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - Number.parseInt(period))

    // Statistiques des transactions
    const transactionStats = await Transaction.aggregate([
      {
        $match: {
          userId: req.user._id,
          date: { $gte: startDate },
        },
      },
      {
        $group: {
          _id: null,
          totalIncome: {
            $sum: { $cond: [{ $gt: ["$amount", 0] }, "$amount", 0] },
          },
          totalExpenses: {
            $sum: { $cond: [{ $lt: ["$amount", 0] }, { $abs: "$amount" }, 0] },
          },
          transactionCount: { $sum: 1 },
        },
      },
    ])

    // Solde total des comptes
    const accountStats = await Account.aggregate([
      {
        $match: {
          userId: req.user._id,
          isActive: true,
        },
      },
      {
        $group: {
          _id: null,
          totalBalance: { $sum: "$balance" },
          accountCount: { $sum: 1 },
        },
      },
    ])

    // Objectifs actifs
    const goalStats = await Goal.aggregate([
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
        },
      },
    ])

    const stats = {
      transactions: transactionStats[0] || {
        totalIncome: 0,
        totalExpenses: 0,
        transactionCount: 0,
      },
      accounts: accountStats[0] || {
        totalBalance: 0,
        accountCount: 0,
      },
      goals: goalStats[0] || {
        totalGoals: 0,
        completedGoals: 0,
        totalTargetAmount: 0,
        totalCurrentAmount: 0,
      },
    }

    // Calculer le solde net
    stats.transactions.netAmount = stats.transactions.totalIncome - stats.transactions.totalExpenses

    res.json({
      success: true,
      data: stats,
      period: Number.parseInt(period),
    })
  } catch (error) {
    console.error("Erreur lors de la récupération des statistiques rapides:", error)
    res.status(500).json({
      success: false,
      error: "Erreur lors de la récupération des statistiques rapides",
    })
  }
})

module.exports = router
