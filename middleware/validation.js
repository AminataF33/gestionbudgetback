const { body, param, query, validationResult } = require("express-validator")

// Middleware pour gérer les erreurs de validation
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req)

  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: "Erreurs de validation",
      details: errors.array().map((error) => ({
        field: error.path,
        message: error.msg,
        value: error.value,
      })),
    })
  }

  next()
}

// Validations pour l'authentification
const validateSignup = [
  body("firstName")
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage("Le prénom doit contenir entre 2 et 50 caractères")
    .matches(/^[a-zA-ZÀ-ÿ\s'-]+$/)
    .withMessage("Le prénom ne peut contenir que des lettres, espaces, apostrophes et tirets"),

  body("lastName")
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage("Le nom doit contenir entre 2 et 50 caractères")
    .matches(/^[a-zA-ZÀ-ÿ\s'-]+$/)
    .withMessage("Le nom ne peut contenir que des lettres, espaces, apostrophes et tirets"),

  body("email")
    .isEmail()
    .withMessage("Format d'email invalide")
    .normalizeEmail()
    .isLength({ max: 100 })
    .withMessage("L'email ne peut pas dépasser 100 caractères"),

  body("phone")
    .matches(/^(\+221|00221)?[0-9]{9}$/)
    .withMessage("Format de téléphone sénégalais invalide (ex: +221123456789 ou 123456789)"),

  body("password")
    .isLength({ min: 8 })
    .withMessage("Le mot de passe doit contenir au moins 8 caractères")
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage("Le mot de passe doit contenir au moins une minuscule, une majuscule et un chiffre"),

  body("city")
    .isIn([
      "Dakar",
      "Thiès",
      "Kaolack",
      "Saint-Louis",
      "Ziguinchor",
      "Diourbel",
      "Tambacounda",
      "Kolda",
      "Fatick",
      "Kaffrine",
      "Kédougou",
      "Louga",
      "Matam",
      "Sédhiou",
    ])
    .withMessage("Ville non valide"),

  body("profession")
    .isIn([
      "Fonctionnaire",
      "Commerçant(e)",
      "Enseignant(e)",
      "Étudiant(e)",
      "Entrepreneur",
      "Employé(e) privé",
      "Artisan",
      "Agriculteur",
      "Chauffeur",
      "Infirmier(ère)",
      "Ingénieur",
      "Médecin",
      "Avocat",
      "Autre",
    ])
    .withMessage("Profession non valide"),

  handleValidationErrors,
]

const validateLogin = [
  body("email").isEmail().withMessage("Format d'email invalide").normalizeEmail(),
  body("password").notEmpty().withMessage("Le mot de passe est requis"),
  handleValidationErrors,
]

// Validations pour les comptes
const validateAccount = [
  body("name")
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage("Le nom du compte doit contenir entre 1 et 100 caractères"),

  body("bank")
    .isIn([
      "CBAO",
      "SGBS",
      "BOA",
      "Ecobank",
      "UBA",
      "BHS",
      "BICIS",
      "Banque Atlantique",
      "BNDE",
      "Crédit du Sénégal",
      "Autre",
    ])
    .withMessage("Banque non valide"),

  body("type").isIn(["checking", "savings", "credit", "investment"]).withMessage("Type de compte non valide"),

  body("balance").optional().isFloat({ min: 0 }).withMessage("Le solde doit être un nombre positif"),

  body("currency").optional().isIn(["CFA", "EUR", "USD"]).withMessage("Devise non valide"),

  body("accountNumber")
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage("Le numéro de compte ne peut pas dépasser 50 caractères"),

  body("description")
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage("La description ne peut pas dépasser 500 caractères"),

  body("color")
    .optional()
    .matches(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/)
    .withMessage("Format de couleur invalide (ex: #FF0000)"),

  handleValidationErrors,
]

// Validations pour les transactions - VERSION CORRIGÉE
const validateTransaction = [
  // Validation pour accountId - MongoDB ObjectId
  body("accountId")
    .notEmpty()
    .withMessage("L'ID de compte est requis")
    .isMongoId()
    .withMessage("ID de compte invalide"),
  
  // Validation pour categoryId - MongoDB ObjectId
  body("categoryId")
    .notEmpty()
    .withMessage("L'ID de catégorie est requis")
    .isMongoId()
    .withMessage("ID de catégorie invalide"),
  
  // Type de transaction
  body("type")
    .isIn(["income", "expense", "transfer"])
    .withMessage("Type de transaction non valide"),
  
  // Montant
  body("amount")
    .isFloat({ min: 0.01 })
    .withMessage("Le montant doit être supérieur à 0"),
  
  // Description
  body("description")
    .trim()
    .isLength({ min: 1, max: 500 })
    .withMessage("La description doit contenir entre 1 et 500 caractères"),
    
  // Date
  body("date")
    .isISO8601()
    .withMessage("Format de date invalide"),

  // Champs optionnels
  body("merchant")
    .optional()
    .trim()
    .isLength({ max: 200 })
    .withMessage("Le nom du marchand ne peut pas dépasser 200 caractères"),

  body("paymentMethod")
    .optional()
    .isIn(["cash", "card", "transfer", "mobile_money", "check", "other"])
    .withMessage("Méthode de paiement non valide"),

  body("currency")
    .optional()
    .isIn(["CFA", "EUR", "USD"])
    .withMessage("Devise non valide"),

  body("tags")
    .optional()
    .isArray()
    .withMessage("Les tags doivent être un tableau"),

  body("tags.*")
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage("Un tag ne peut pas dépasser 50 caractères"),

  body("transferAccountId")
    .optional()
    .isMongoId()
    .withMessage("ID de compte de destination invalide"),

  body("notes")
    .optional()
    .trim()
    .isLength({ max: 1000 })
    .withMessage("Les notes ne peuvent pas dépasser 1000 caractères"),

  handleValidationErrors,
]

// Validations pour les budgets
const validateBudget = [
  body("categoryId").isMongoId().withMessage("ID de catégorie invalide"),

  body("name")
    .trim()
    .isLength({ min: 1, max: 200 })
    .withMessage("Le nom du budget doit contenir entre 1 et 200 caractères"),

  body("amount").isFloat({ min: 0.01 }).withMessage("Le montant du budget doit être supérieur à 0"),

  body("period").isIn(["weekly", "monthly", "quarterly", "yearly"]).withMessage("Période non valide"),

  body("startDate").isISO8601().withMessage("Format de date de début invalide"),

  body("endDate")
    .isISO8601()
    .withMessage("Format de date de fin invalide")
    .custom((endDate, { req }) => {
      if (new Date(endDate) <= new Date(req.body.startDate)) {
        throw new Error("La date de fin doit être postérieure à la date de début")
      }
      return true
    }),

  body("alertThreshold")
    .optional()
    .isFloat({ min: 0, max: 100 })
    .withMessage("Le seuil d'alerte doit être entre 0 et 100"),

  body("description")
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage("La description ne peut pas dépasser 500 caractères"),

  body("color")
    .optional()
    .matches(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/)
    .withMessage("Format de couleur invalide"),

  handleValidationErrors,
]

// Validations pour les objectifs
const validateGoal = [
  body("name")
    .trim()
    .isLength({ min: 1, max: 200 })
    .withMessage("Le nom de l'objectif doit contenir entre 1 et 200 caractères"),

  body("targetAmount").isFloat({ min: 0.01 }).withMessage("Le montant cible doit être supérieur à 0"),

  body("targetDate")
    .isISO8601()
    .withMessage("Format de date cible invalide")
    .custom((targetDate) => {
      if (new Date(targetDate) <= new Date()) {
        throw new Error("La date cible doit être dans le futur")
      }
      return true
    }),

  body("category")
    .isIn([
      "emergency_fund",
      "vacation",
      "house",
      "car",
      "education",
      "retirement",
      "wedding",
      "business",
      "electronics",
      "health",
      "other",
    ])
    .withMessage("Catégorie d'objectif non valide"),

  body("priority").optional().isIn(["low", "medium", "high"]).withMessage("Priorité non valide"),

  body("description")
    .optional()
    .trim()
    .isLength({ max: 1000 })
    .withMessage("La description ne peut pas dépasser 1000 caractères"),

  body("color")
    .optional()
    .matches(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/)
    .withMessage("Format de couleur invalide"),

  handleValidationErrors,
]

// Validations pour les paramètres de requête
const validatePagination = [
  query("page").optional().isInt({ min: 1 }).withMessage("Le numéro de page doit être un entier positif"),

  query("limit").optional().isInt({ min: 1, max: 100 }).withMessage("La limite doit être entre 1 et 100"),

  query("sortBy").optional().isAlpha().withMessage("Le champ de tri doit contenir uniquement des lettres"),

  query("sortOrder")
    .optional()
    .isIn(["asc", "desc", "1", "-1"])
    .withMessage("L'ordre de tri doit être 'asc', 'desc', '1' ou '-1'"),

  handleValidationErrors,
]

// Validations pour les paramètres MongoDB ID
const validateMongoId = (paramName = "id") => [
  param(paramName).isMongoId().withMessage(`${paramName} invalide`),
  handleValidationErrors,
]

// Validations pour les dates de période
const validateDateRange = [
  query("startDate").optional().isISO8601().withMessage("Format de date de début invalide"),

  query("endDate")
    .optional()
    .isISO8601()
    .withMessage("Format de date de fin invalide")
    .custom((endDate, { req }) => {
      if (req.query.startDate && new Date(endDate) <= new Date(req.query.startDate)) {
        throw new Error("La date de fin doit être postérieure à la date de début")
      }
      return true
    }),

  handleValidationErrors,
]

// Validation pour la mise à jour du profil
const validateProfileUpdate = [
  body("firstName")
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage("Le prénom doit contenir entre 2 et 50 caractères"),

  body("lastName")
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage("Le nom doit contenir entre 2 et 50 caractères"),

  body("phone")
    .optional()
    .matches(/^(\+221|00221)?[0-9]{9}$/)
    .withMessage("Format de téléphone sénégalais invalide"),

  body("city")
    .optional()
    .isIn([
      "Dakar",
      "Thiès",
      "Kaolack",
      "Saint-Louis",
      "Ziguinchor",
      "Diourbel",
      "Tambacounda",
      "Kolda",
      "Fatick",
      "Kaffrine",
      "Kédougou",
      "Louga",
      "Matam",
      "Sédhiou",
    ])
    .withMessage("Ville non valide"),

  body("profession")
    .optional()
    .isIn([
      "Fonctionnaire",
      "Commerçant(e)",
      "Enseignant(e)",
      "Étudiant(e)",
      "Entrepreneur",
      "Employé(e) privé",
      "Artisan",
      "Agriculteur",
      "Chauffeur",
      "Infirmier(ère)",
      "Ingénieur",
      "Médecin",
      "Avocat",
      "Autre",
    ])
    .withMessage("Profession non valide"),

  body("preferences.currency").optional().isIn(["CFA", "EUR", "USD"]).withMessage("Devise non valide"),

  body("preferences.language").optional().isIn(["fr", "en", "wo"]).withMessage("Langue non valide"),

  body("preferences.theme").optional().isIn(["light", "dark", "auto"]).withMessage("Thème non valide"),

  handleValidationErrors,
]

module.exports = {
  validateSignup,
  validateLogin,
  validateAccount,
  validateTransaction,
  validateBudget,
  validateGoal,
  validatePagination,
  validateMongoId,
  validateDateRange,
  validateProfileUpdate,
  handleValidationErrors,
}