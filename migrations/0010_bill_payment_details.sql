-- Informações do pagamento (migração aditiva sem perder contas quitadas).
ALTER TABLE finance_bills ADD COLUMN payment_method TEXT
  CHECK (payment_method IS NULL OR payment_method IN ('pix','debit','credit','transfer','cash','boleto','other'));
ALTER TABLE finance_bills ADD COLUMN payment_source TEXT NOT NULL DEFAULT '';
ALTER TABLE finance_bills ADD COLUMN paid_amount_cents INTEGER CHECK (paid_amount_cents IS NULL OR paid_amount_cents > 0);
ALTER TABLE finance_bills ADD COLUMN payment_notes TEXT NOT NULL DEFAULT '';

-- Congela o valor pago das contas legadas, sem inventar uma forma de pagamento.
UPDATE finance_bills
  SET paid_amount_cents = amount_cents
  WHERE paid_at IS NOT NULL AND paid_amount_cents IS NULL;
