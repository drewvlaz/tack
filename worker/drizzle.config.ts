import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'sqlite',
  // schema will live at src/schema.ts once defined
  schema: './src/schema.ts',
  out: './migrations',
})
