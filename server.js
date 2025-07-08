const express = require("express")
const mongoose = require("mongoose")
const cors = require("cors")
const helmet = require("helmet")
const rateLimit = require("express-rate-limit")
const morgan = require("morgan")
require("dotenv").config()

const authRoutes = require("./routes/auth")
const userRoutes = require("./routes/users")
const accountRoutes = require("./routes/accounts")
const categoryRoutes = require("./routes/categories")
const transactionRoutes = require("./routes/transactions")
const budgetRoutes = require("./routes/budgets")
const goalRoutes = require("./routes/goals")
const analyticsRoutes = require("./routes/analytics")
const dashboardRoutes = require("./routes/dashboard")

const app = express()
app.set("trust proxy", 1)

// Middleware de sécurité
app.use(helmet())

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limite chaque IP à 100 requêtes par windowMs
  message: "Trop de requêtes depuis cette IP, réessayez plus tard.",
})
app.use("/api/", limiter)

// CORS configuration
app.use(
  cors({
    origin: process.env.FRONTEND_URL,
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
)

// Logging
app.use(morgan("combined"))

// Body parsing middleware
app.use(express.json({ limit: "10mb" }))
app.use(express.urlencoded({ extended: true }))

// Connexion à MongoDB
mongoose
  .connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => {
    console.log("✅ Connecté à MongoDB")
  })
  .catch((error) => {
    console.error("❌ Erreur de connexion à MongoDB:", error)
    process.exit(1)
  })

// Routes API
app.use("/api/auth", authRoutes)
app.use("/api/users", userRoutes)
app.use("/api/accounts", accountRoutes)
app.use("/api/categories", categoryRoutes)
app.use("/api/transactions", transactionRoutes)
app.use("/api/budgets", budgetRoutes)
app.use("/api/goals", goalRoutes)
app.use("/api/analytics", analyticsRoutes)
app.use("/api/dashboard", dashboardRoutes)

// Route de santé
app.get("/api/health", (req, res) => {
  res.json({
    status: "OK",
    message: "MonBudget API is running",
    timestamp: new Date().toISOString(),
    version: "1.0.0",
  })
})

// Middleware de gestion d'erreurs
app.use((err, req, res, next) => {
  console.error("Erreur:", err.stack)

  if (err.name === "ValidationError") {
    return res.status(400).json({
      success: false,
      error: "Données invalides",
      details: Object.values(err.errors).map((e) => e.message),
    })
  }

  if (err.name === "CastError") {
    return res.status(400).json({
      success: false,
      error: "ID invalide",
    })
  }

  if (err.code === 11000) {
    return res.status(400).json({
      success: false,
      error: "Cette ressource existe déjà",
    })
  }

  res.status(500).json({
    success: false,
    error: "Erreur interne du serveur",
  })
})

// Route 404
app.use("*", (req, res) => {
  res.status(404).json({
    success: false,
    error: "Route non trouvée",
  })
})

const PORT = process.env.PORT || 5001

app.listen(PORT, () => {
  console.log(`🚀 Serveur MonBudget démarré sur le port ${PORT}`)
  console.log(`📱 Frontend URL: ${process.env.FRONTEND_URL}`)
  console.log(`🔗 API URL: https://budgetbackend-pvph.onrender.com`)
})

module.exports = app
