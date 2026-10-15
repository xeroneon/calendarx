import 'dotenv/config'
import { startServer } from './app.js'

startServer().catch((err) => {
  throw err
})