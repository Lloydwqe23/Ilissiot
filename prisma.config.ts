import { defineConfig } from '@prisma/config';

export default defineConfig({
  datasource: {
    // Тепер ми не пишемо пароль тут, а беремо його з .env
    url: process.env.DATABASE_URL,
  },
});