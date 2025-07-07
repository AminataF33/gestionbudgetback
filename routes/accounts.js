const express = require("express")
const Account = require("../models/Account")
const auth = require("../middleware/auth")

const router = express.Router()

// @route   GET /api/accounts
// @desc    Obtenir les comptes de l'utilisateur
// @access  Private
router.get("/", auth, async (req, res) => {
  try {
    const { isActive = true } = req.query

    const filter = { userId: req.user._id }
    if (isActive !== "all") {
      filter.isActive = isActive === "true"
    }

    const accounts = await Account.find(filter).sort({ createdAt: 1 })

    res.json({
      success: true,
      data: accounts,
    })
  } catch (error) {
    console.error("Erreur lors de la récupération des comptes:", error)
    res.status(500).json({
      success: false,
      error: "Erreur lors de la récupération des comptes",
    })
  }
})

// @route   POST /api/accounts
// @desc    Créer un nouveau compte
// @access  Private
router.post("/", auth, async (req, res) => {
  try {
    const { name, bank, type, balance = 0, accountNumber, description } = req.body

    const account = new Account({
      userId: req.user._id,
      name,
      bank,
      type,
      balance: Number.parseFloat(balance),
      accountNumber,
      description,
    })

    await account.save()

    res.status(201).json({
      success: true,
      message: "Compte créé avec succès",
      data: account,
    })
  } catch (error) {
    console.error("Erreur lors de la création du compte:", error)
    res.status(500).json({
      success: false,
      error: "Erreur lors de la création du compte",
    })
  }
})

module.exports = router
