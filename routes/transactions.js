const express = require("express")
const Transaction = require("../models/Transaction")
const Account = require("../models/Account")
const Category = require("../models/Category")
const auth = require("../middleware/auth")
const { validateTransaction } = require("../middleware/validation")

const router = express.Router()

// @route   GET /api/transactions
// @desc    Obtenir les transactions de l'utilisateur
// @access  Private
router.get("/", auth, async (req, res) => {
  try {
    const { category, search, limit = 50, offset = 0, startDate, endDate, accountId, type } = req.query

    // Construire le filtre
    const filter = { userId: req.user._id }

    if (startDate && endDate) {
      filter.date = {
        $gte: new Date(startDate),
        $lte: new Date(endDate),
      }
    }

    if (accountId) {
      filter.accountId = accountId
    }

    if (type) {
      filter.amount = type === "income" ? { $gt: 0 } : { $lt: 0 }
    }

    if (search) {
      filter.description = { $regex: search, $options: "i" }
    }

    // Pipeline d'agrégation pour joindre les données
    const pipeline = [
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
        $lookup: {
          from: "accounts",
          localField: "accountId",
          foreignField: "_id",
          as: "account",
        },
      },
      {
        $unwind: "$category",
      },
      {
        $unwind: "$account",
      },
      {
        $match: category && category !== "all" ? { "category.name": category } : {},
      },
      {
        $project: {
          _id: 1,
          description: 1,
          amount: 1,
          date: 1,
          notes: 1,
          tags: 1,
          createdAt: 1,
          category: {
            _id: "$category._id",
            name: "$category.name",
            color: "$category.color",
            icon: "$category.icon",
          },
          account: {
            _id: "$account._id",
            name: "$account.name",
            bank: "$account.bank",
            type: "$account.type",
          },
        },
      },
      { $sort: { date: -1, createdAt: -1 } },
      { $skip: Number.parseInt(offset) },
      { $limit: Number.parseInt(limit) },
    ]

    const transactions = await Transaction.aggregate(pipeline)

    // Compter le total pour la pagination
    const totalCount = await Transaction.countDocuments(filter)

    res.json({
      success: true,
      data: transactions,
      pagination: {
        total: totalCount,
        limit: Number.parseInt(limit),
        offset: Number.parseInt(offset),
        hasMore: totalCount > Number.parseInt(offset) + Number.parseInt(limit),
      },
    })
  } catch (error) {
    console.error("Erreur lors de la récupération des transactions:", error)
    res.status(500).json({
      success: false,
      error: "Erreur lors de la récupération des transactions",
    })
  }
})

// @route   POST /api/transactions
// @desc    Créer une nouvelle transaction
// @access  Private
router.post("/", auth, validateTransaction, async (req, res) => {
  try {
    const { accountId, categoryId, description, amount, date, notes, tags } = req.body

    // Vérifier que le compte appartient à l'utilisateur
    const account = await Account.findOne({ _id: accountId, userId: req.user._id })
    if (!account) {
      return res.status(404).json({
        success: false,
        error: "Compte non trouvé",
      })
    }

    // Vérifier que la catégorie existe
    const category = await Category.findById(categoryId)
    if (!category) {
      return res.status(404).json({
        success: false,
        error: "Catégorie non trouvée",
      })
    }

    // Créer la transaction
    const transaction = new Transaction({
      userId: req.user._id,
      accountId,
      categoryId,
      description,
      amount: Number.parseFloat(amount),
      date: date || new Date(),
      notes,
      tags,
    })

    await transaction.save()

    // Récupérer la transaction avec les données jointes
    const populatedTransaction = await Transaction.findById(transaction._id)
      .populate("categoryId", "name color icon")
      .populate("accountId", "name bank type")

    res.status(201).json({
      success: true,
      message: "Transaction créée avec succès",
      data: populatedTransaction,
    })
  } catch (error) {
    console.error("Erreur lors de la création de la transaction:", error)
    res.status(500).json({
      success: false,
      error: "Erreur lors de la création de la transaction",
    })
  }
})

// @route   GET /api/transactions/:id
// @desc    Obtenir une transaction spécifique
// @access  Private
router.get("/:id", auth, async (req, res) => {
  try {
    const transaction = await Transaction.findOne({
      _id: req.params.id,
      userId: req.user._id,
    })
      .populate("categoryId", "name color icon")
      .populate("accountId", "name bank type")

    if (!transaction) {
      return res.status(404).json({
        success: false,
        error: "Transaction non trouvée",
      })
    }

    res.json({
      success: true,
      data: transaction,
    })
  } catch (error) {
    console.error("Erreur lors de la récupération de la transaction:", error)
    res.status(500).json({
      success: false,
      error: "Erreur lors de la récupération de la transaction",
    })
  }
})

// @route   PUT /api/transactions/:id
// @desc    Mettre à jour une transaction
// @access  Private
router.put("/:id", auth, validateTransaction, async (req, res) => {
  try {
    const { accountId, categoryId, description, amount, date, notes, tags } = req.body

    // Trouver la transaction
    const transaction = await Transaction.findOne({
      _id: req.params.id,
      userId: req.user._id,
    })

    if (!transaction) {
      return res.status(404).json({
        success: false,
        error: "Transaction non trouvée",
      })
    }

    // Vérifier le nouveau compte si changé
    if (accountId !== transaction.accountId.toString()) {
      const account = await Account.findOne({ _id: accountId, userId: req.user._id })
      if (!account) {
        return res.status(404).json({
          success: false,
          error: "Compte non trouvé",
        })
      }

      // Ajuster les soldes des comptes
      await Account.findByIdAndUpdate(transaction.accountId, {
        $inc: { balance: -transaction.amount },
      })
      await Account.findByIdAndUpdate(accountId, {
        $inc: { balance: Number.parseFloat(amount) },
      })
    } else if (amount !== transaction.amount) {
      // Ajuster le solde si le montant a changé
      const difference = Number.parseFloat(amount) - transaction.amount
      await Account.findByIdAndUpdate(accountId, {
        $inc: { balance: difference },
      })
    }

    // Mettre à jour la transaction
    transaction.accountId = accountId
    transaction.categoryId = categoryId
    transaction.description = description
    transaction.amount = Number.parseFloat(amount)
    transaction.date = date || transaction.date
    transaction.notes = notes
    transaction.tags = tags

    await transaction.save()

    const updatedTransaction = await Transaction.findById(transaction._id)
      .populate("categoryId", "name color icon")
      .populate("accountId", "name bank type")

    res.json({
      success: true,
      message: "Transaction mise à jour avec succès",
      data: updatedTransaction,
    })
  } catch (error) {
    console.error("Erreur lors de la mise à jour de la transaction:", error)
    res.status(500).json({
      success: false,
      error: "Erreur lors de la mise à jour de la transaction",
    })
  }
})

// @route   DELETE /api/transactions/:id
// @desc    Supprimer une transaction
// @access  Private
router.delete("/:id", auth, async (req, res) => {
  try {
    const transaction = await Transaction.findOneAndDelete({
      _id: req.params.id,
      userId: req.user._id,
    })

    if (!transaction) {
      return res.status(404).json({
        success: false,
        error: "Transaction non trouvée",
      })
    }

    res.json({
      success: true,
      message: "Transaction supprimée avec succès",
    })
  } catch (error) {
    console.error("Erreur lors de la suppression de la transaction:", error)
    res.status(500).json({
      success: false,
      error: "Erreur lors de la suppression de la transaction",
    })
  }
})

// @route   GET /api/transactions/stats/summary
// @desc    Obtenir un résumé des transactions
// @access  Private
router.get("/stats/summary", auth, async (req, res) => {
  try {
    const { period = "30" } = req.query
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - Number.parseInt(period))

    const stats = await Transaction.aggregate([
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
          avgTransaction: { $avg: "$amount" },
        },
      },
    ])

    const result = stats[0] || {
      totalIncome: 0,
      totalExpenses: 0,
      transactionCount: 0,
      avgTransaction: 0,
    }

    result.netAmount = result.totalIncome - result.totalExpenses

    res.json({
      success: true,
      data: result,
      period: Number.parseInt(period),
    })
  } catch (error) {
    console.error("Erreur lors de la récupération des statistiques:", error)
    res.status(500).json({
      success: false,
      error: "Erreur lors de la récupération des statistiques",
    })
  }
})

module.exports = router
