const jwt = require("jsonwebtoken")
const User = require("../models/User")

const auth = async (req, res, next) => {
  try {
    // Récupérer le token depuis l'en-tête Authorization
    const authHeader = req.header("Authorization")

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        error: "Accès refusé. Token manquant ou format invalide.",
        message: "Veuillez fournir un token d'authentification valide.",
      })
    }

    const token = authHeader.replace("Bearer ", "")

    // Vérifier et décoder le token
    const decoded = jwt.verify(token, process.env.JWT_SECRET)

    // Trouver l'utilisateur
    const user = await User.findById(decoded.userId).select("-password")

    if (!user) {
      return res.status(401).json({
        success: false,
        error: "Token invalide. Utilisateur non trouvé.",
        message: "L'utilisateur associé à ce token n'existe plus.",
      })
    }

    // Vérifier si le compte est actif
    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        error: "Compte désactivé.",
        message: "Votre compte a été désactivé. Contactez le support.",
      })
    }

    // Ajouter l'utilisateur à la requête
    req.user = user
    next()
  } catch (error) {
    console.error("Erreur d'authentification:", error)

    // Gestion des erreurs JWT spécifiques
    if (error.name === "JsonWebTokenError") {
      return res.status(401).json({
        success: false,
        error: "Token invalide.",
        message: "Le token fourni n'est pas valide.",
      })
    }

    if (error.name === "TokenExpiredError") {
      return res.status(401).json({
        success: false,
        error: "Token expiré.",
        message: "Votre session a expiré. Veuillez vous reconnecter.",
      })
    }

    if (error.name === "NotBeforeError") {
      return res.status(401).json({
        success: false,
        error: "Token pas encore valide.",
        message: "Le token n'est pas encore actif.",
      })
    }

    // Erreur générique
    res.status(500).json({
      success: false,
      error: "Erreur d'authentification.",
      message: "Une erreur est survenue lors de la vérification de l'authentification.",
    })
  }
}

// Middleware optionnel pour les routes qui peuvent fonctionner avec ou sans authentification
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.header("Authorization")

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      // Pas de token, continuer sans utilisateur
      req.user = null
      return next()
    }

    const token = authHeader.replace("Bearer ", "")
    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    const user = await User.findById(decoded.userId).select("-password")

    if (user && user.isActive) {
      req.user = user
    } else {
      req.user = null
    }

    next()
  } catch (error) {
    // En cas d'erreur, continuer sans utilisateur
    req.user = null
    next()
  }
}

// Middleware pour vérifier les rôles (pour une future extension)
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: "Authentification requise.",
      })
    }

    if (!roles.includes(req.user.role || "user")) {
      return res.status(403).json({
        success: false,
        error: "Accès interdit. Permissions insuffisantes.",
      })
    }

    next()
  }
}

// Middleware pour vérifier la propriété des ressources
const checkResourceOwnership = (resourceModel, resourceIdParam = "id") => {
  return async (req, res, next) => {
    try {
      const resourceId = req.params[resourceIdParam]
      const Model = require(`../models/${resourceModel}`)

      const resource = await Model.findById(resourceId)

      if (!resource) {
        return res.status(404).json({
          success: false,
          error: "Ressource non trouvée.",
        })
      }

      // Vérifier si l'utilisateur est propriétaire de la ressource
      if (resource.userId && !resource.userId.equals(req.user._id)) {
        return res.status(403).json({
          success: false,
          error: "Accès interdit. Vous n'êtes pas autorisé à accéder à cette ressource.",
        })
      }

      // Ajouter la ressource à la requête pour éviter une nouvelle requête
      req.resource = resource
      next()
    } catch (error) {
      console.error("Erreur lors de la vérification de propriété:", error)
      res.status(500).json({
        success: false,
        error: "Erreur lors de la vérification des permissions.",
      })
    }
  }
}

module.exports = {
  auth,
  optionalAuth,
  authorize,
  checkResourceOwnership,
}
