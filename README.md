# Control de Deudas

Aplicación web para llevar el control de deudas que otras personas tienen contigo.

## Características

- Panel de administrador para crear deudores y deudas mensuales.
- Los deudores pueden iniciar sesión y registrar pagos parciales con comprobante de imagen.
- El administrador aprueba o rechaza los pagos.
- Cálculo automático de saldo pendiente.
- Recordatorios automáticos por Telegram cuando una deuda lleva 5 o más días de retraso.
- Responsive y lista para desplegar en un VPS con Docker.

## Stack

- Next.js 16 + TypeScript
- Tailwind CSS
- PostgreSQL + Prisma ORM
- NextAuth.js
- Docker + Docker Compose
- Nginx + Let's Encrypt

## Despliegue en VPS

### 1. Clonar o subir el proyecto

Sube el contenido de este proyecto a tu VPS.

### 2. Configurar variables de entorno

```bash
cp .env.example .env
nano .env
```

Edita al menos:

- `NEXTAUTH_URL`: URL de tu dominio (ej. `http://pagos.grupotelsys.com:8081`)
- `NEXTAUTH_SECRET`: un string largo y aleatorio
- `ADMIN_EMAIL` y `ADMIN_PASSWORD`: credenciales del administrador inicial
- `TELEGRAM_BOT_TOKEN` y `ADMIN_TELEGRAM_CHAT_ID` (opcional, para recordatorios)

### 3. Configurar dominio en Nginx

Edita `nginx/nginx.conf` y reemplaza `example.com` con tu dominio.

Edita `init-letsencrypt.sh` y reemplaza `example.com` y el correo electrónico.

### 4. Obtener certificado SSL

```bash
chmod +x init-letsencrypt.sh
./init-letsencrypt.sh
```

### 5. Levantar la aplicación

```bash
docker compose -f docker-compose.prod.yml up -d
```

La primera vez se ejecutarán las migraciones y se creará el usuario administrador.

### 6. Acceder

Visita tu dominio e inicia sesión con el correo y contraseña de administrador configurados.

## Configuración de Telegram

1. Crea un bot con [@BotFather](https://t.me/BotFather) y obtén el token.
2. Envía un mensaje a tu bot para activarlo.
3. Obtén tu chat ID usando [@userinfobot](https://t.me/userinfobot).
4. Configura `TELEGRAM_BOT_TOKEN` en `.env` y guarda tu chat ID en la sección de Configuración de la app.

## Comandos útiles

```bash
# Ver logs
docker compose -f docker-compose.prod.yml logs -f app

# Reiniciar
docker compose -f docker-compose.prod.yml restart

# Actualizar después de cambios en el código
docker compose -f docker-compose.prod.yml up -d --build
```