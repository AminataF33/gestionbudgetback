const express = require("express")
const jwt = require("jsonwebtoken")
const User = require("../models/User")
const Account = require("../models/Account")
const { validateSignup, validateLogin } = require("../middleware/validation")
const { auth } = require("../middleware/auth")

const router = express.Router()

// @route   POST /api/auth/signup
// @desc    Inscription d'un nouvel utilisateur
// @access  Public
router.post("/signup", validateSignup, async (req, res) => {
  try {
    const { firstName, lastName, email, phone, password, city, profession } = req.body

    // Vérifier si l'utilisateur existe déjà
    const existingUser = await User.findOne({ email })
    if (existingUser) {
      return res.status(400).json({
        success: false,
        error: "Un compte avec cet email existe déjà",
        message: "Veuillez utiliser une autre adresse email ou vous connecter.",
      })
    }

    // Vérifier si le téléphone existe déjà
    const existingPhone = await User.findOne({ phone })
    if (existingPhone) {
      return res.status(400).json({
        success: false,
        error: "Un compte avec ce numéro de téléphone existe déjà",
        message: "Veuillez utiliser un autre numéro de téléphone.",
      })
    }

    // Créer le nouvel utilisateur
    const user = new User({
      firstName,
      lastName,
      email,
      phone,
      password,
      city,
      profession,
    })

    await user.save()

    // Créer des comptes par défaut
    const defaultAccounts = [
      {
        userId: user._id,
        name: "Compte Principal",
        bank: "BOA",
        type: "checking",
        balance: 0,
        color: "#3B82F6",
        icon: "CreditCard",
      },
      {
        userId: user._id,
        name: "Épargne",
        bank: "SGBS",
        type: "savings",
        balance: 0,
        color: "#10B981",
        icon: "PiggyBank",
      },
    ]

    await Account.insertMany(defaultAccounts)

    // Générer le token JWT
    const token = jwt.sign(
      {
        userId: user._id,
        email: user.email,
      },
      process.env.JWT_SECRET,
      {
        expiresIn: process.env.JWT_EXPIRE || "7d",
      },
    )

    // Mettre à jour la dernière connexion
    user.lastLogin = new Date()
    await user.save()

    res.status(201).json({
      success: true,
      message: "Compte créé avec succès",
      token,
      user: user.getPublicProfile(),
    })
  } catch (error) {
    console.error("Erreur lors de l'inscription:", error)

    // Gestion des erreurs de validation Mongoose
    if (error.name === "ValidationError") {
      const errors = Object.values(error.errors).map((err) => err.message)
      return res.status(400).json({
        success: false,
        error: "Erreurs de validation",
        details: errors,
      })
    }

    res.status(500).json({
      success: false,
      error: "Erreur lors de la création du compte",
      message: "Une erreur interne est survenue. Veuillez réessayer.",
    })
  }
})

// @route   POST /api/auth/login
// @desc    Connexion d'un utilisateur
// @access  Public
router.post("/login", validateLogin, async (req, res) => {
  try {
    const { email, password } = req.body

    // Trouver l'utilisateur avec le mot de passe
    const user = await User.findOne({ email }).select("+password")
    if (!user) {
      return res.status(401).json({
        success: false,
        error: "Email ou mot de passe incorrect",
        message: "Vérifiez vos identifiants et réessayez.",
      })
    }

    // Vérifier le mot de passe
    const isValidPassword = await user.comparePassword(password)
    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        error: "Email ou mot de passe incorrect",
        message: "Vérifiez vos identifiants et réessayez.",
      })
    }

    // Vérifier si le compte est actif
    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        error: "Compte désactivé",
        message: "Votre compte a été désactivé. Contactez le support.",
      })
    }

    // Mettre à jour la dernière connexion
    user.lastLogin = new Date()
    await user.save()

    // Générer le token JWT
    const token = jwt.sign(
      {
        userId: user._id,
        email: user.email,
      },
      process.env.JWT_SECRET,
      {
        expiresIn: process.env.JWT_EXPIRE || "7d",
      },
    )

    res.json({
      success: true,
      message: "Connexion réussie",
      token,
      user: user.getPublicProfile(),
    })
  } catch (error) {
    console.error("Erreur lors de la connexion:", error)
    res.status(500).json({
      success: false,
      error: "Erreur lors de la connexion",
      message: "Une erreur interne est survenue. Veuillez réessayer.",
    })
  }
})

// @route   GET /api/auth/me
// @desc    Obtenir les informations de l'utilisateur connecté
// @access  Private
router.get("/me", auth, async (req, res) => {
  try {
    res.json({
      success: true,
      user: req.user.getPublicProfile(),
    })
  } catch (error) {
    console.error("Erreur lors de la récupération du profil:", error)
    res.status(500).json({
      success: false,
      error: "Erreur lors de la récupération du profil",
      message: "Impossible de récupérer les informations du profil.",
    })
  }
})

// @route   POST /api/auth/logout
// @desc    Déconnexion (côté client principalement)
// @access  Private
router.post("/logout", auth, async (req, res) => {
  try {
    // Dans une implémentation plus avancée, on pourrait blacklister le token
    // ou maintenir une liste des tokens actifs
    res.json({
      success: true,
      message: "Déconnexion réussie",
    })
  } catch (error) {
    console.error("Erreur lors de la déconnexion:", error)
    res.status(500).json({
      success: false,
      error: "Erreur lors de la déconnexion",
      message: "Une erreur est survenue lors de la déconnexion.",
    })
  }
})

// @route   POST /api/auth/refresh
// @desc    Rafraîchir le token JWT
// @access  Private
router.post("/refresh", auth, async (req, res) => {
  try {
    const token = jwt.sign(
      {
        userId: req.user._id,
        email: req.user.email,
      },
      process.env.JWT_SECRET,
      {
        expiresIn: process.env.JWT_EXPIRE || "7d",
      },
    )

    res.json({
      success: true,
      message: "Token rafraîchi avec succès",
      token,
      user: req.user.getPublicProfile(),
    })
  } catch (error) {
    console.error("Erreur lors du rafraîchissement du token:", error)
    res.status(500).json({
      success: false,
      error: "Erreur lors du rafraîchissement du token",
      message: "Impossible de rafraîchir le token d'authentification.",
    })
  }
})

// @route   POST /api/auth/verify-email
// @desc    Vérifier l'email (pour une future implémentation)
// @access  Private
router.post("/verify-email", auth, async (req, res) => {
  try {
    // Logique de vérification d'email à implémenter
    res.json({
      success: true,
      message: "Fonctionnalité de vérification d'email à venir",
    })
  } catch (error) {
    console.error("Erreur lors de la vérification d'email:", error)
    res.status(500).json({
      success: false,
      error: "Erreur lors de la vérification d'email",
    })
  }
})

// @route   POST /api/auth/forgot-password
// @desc    Demande de réinitialisation de mot de passe
// @access  Public
router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body

    if (!email) {
      return res.status(400).json({
        success: false,
        error: "Email requis",
        message: "Veuillez fournir votre adresse email.",
      })
    }

    const user = await User.findOne({ email })
    if (!user) {
      // Ne pas révéler si l'email existe ou non pour des raisons de sécurité
      return res.json({
        success: true,
        message: "Si cet email existe, vous recevrez un lien de réinitialisation.",
      })
    }

    // Logique d'envoi d'email à implémenter
    res.json({
      success: true,
      message: "Fonctionnalité de réinitialisation de mot de passe à venir",
    })
  } catch (error) {
    console.error("Erreur lors de la demande de réinitialisation:", error)
    res.status(500).json({
      success: false,
      error: "Erreur lors de la demande de réinitialisation",
    })
  }
})

module.exports = router
