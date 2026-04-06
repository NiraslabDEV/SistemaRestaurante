#!/bin/bash
# deploy.sh — Deploy para Oracle Cloud VM (Ubuntu/ARM64)
# Uso: ./scripts/deploy.sh [staging|production]

set -euo pipefail

ENV="${1:-staging}"
REPO_DIR="/opt/restaurante"
BACKEND_DIR="$REPO_DIR/backend"

echo "🚀 Deploy para ambiente: $ENV"

# Carregar variáveis do ambiente correto
if [ "$ENV" = "production" ]; then
  ENV_FILE="$BACKEND_DIR/.env.production"
elif [ "$ENV" = "staging" ]; then
  ENV_FILE="$BACKEND_DIR/.env.staging"
else
  echo "❌ Ambiente inválido: $ENV (use staging ou production)"
  exit 1
fi

if [ ! -f "$ENV_FILE" ]; then
  echo "❌ Arquivo $ENV_FILE não encontrado"
  exit 1
fi

# Atualizar código
cd "$REPO_DIR"
git pull origin main

# Backend
cd "$BACKEND_DIR"

echo "📦 Instalando dependências de produção..."
npm ci --only=production=false

echo "🔨 Build TypeScript..."
npm run build

echo "🗄️ Aplicando migrações..."
DATABASE_URL=$(grep DATABASE_URL "$ENV_FILE" | cut -d= -f2-) \
  npx prisma migrate deploy

echo "🔄 Reiniciando serviço..."
if command -v pm2 &> /dev/null; then
  pm2 restart restaurante-backend --update-env || \
    pm2 start dist/src/server.js \
      --name restaurante-backend \
      --env-file "$ENV_FILE"
else
  echo "⚠️  PM2 não encontrado. Use: pm2 start dist/src/server.js --name restaurante-backend"
fi

echo "✅ Deploy concluído!"
