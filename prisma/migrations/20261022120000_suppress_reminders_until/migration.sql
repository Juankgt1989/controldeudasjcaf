-- El silencio pasa de indefinido a con fecha de expiracion (7 dias).
-- Asi una cuota impaga no se queda muda para siempre por un silencio olvidado.

ALTER TABLE "InstallmentNotification" ADD COLUMN "remindersSuppressedUntil" TIMESTAMP(3);

-- Conservar el silencio vigente (cuota de Alejandra del 05-oct) por 7 dias.
UPDATE "InstallmentNotification"
   SET "remindersSuppressedUntil" = (NOW() AT TIME ZONE 'UTC') + INTERVAL '7 days'
 WHERE "remindersSuppressed" = true;

ALTER TABLE "InstallmentNotification" DROP COLUMN "remindersSuppressed";
