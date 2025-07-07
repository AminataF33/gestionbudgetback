const express = require("express")
const User = require("../models/User")
const auth = require("../middleware/auth")

const router = express.Router()

// @route   GET /api/users/profile
// @desc    Obtenir le profil de l'utilisateur
// @access  Private
router.get("/profile", auth, async (req, res) => {
  try {
    res.json({
      success: true,
      data: req.user.getPublicProfile(),
    })
  } catch (error) {
    console.error("Erreur lors de la récupération du profil:", error)
    res.status(500).json({
      success: false,
      error: "Erreur lors de la récupération du profil",
    })
  }
})

// @route   PUT /api/users/profile
// @desc    Mettre à jour le profil de l'utilisateur
// @access  Private
router.put("/profile", auth, async (req, res) => {
  try {
    const { firstName, lastName, phone, city, profession, preferences } = req.body

    const user = await User.findById(req.user._id)

    if (firstName) user.firstName = firstName
    if (lastName) user.lastName = lastName
    if (phone) user.phone = phone
    if (city) user.city = city
    if (profession) user.profession = profession
    if (preferences) user.preferences = { ...user.preferences, ...preferences }

    await user.save()

    res.json({
      success: true,
      message: "Profil mis à jour avec succès",
      data: user.getPublicProfile(),
    })
  } catch (error) {
    console.error("Erreur lors de la mise à jour du profil:", error)
    res.status(500).json({
      success: false,
      error: "Erreur lors de la mise à jour du profil",
    })
  }
})

module.exports = router
