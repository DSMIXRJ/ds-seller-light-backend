-- Criar nova tabela 'accounts' para suportar múltiplas contas por usuário e por marketplace
CREATE TABLE IF NOT EXISTS accounts (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  marketplace VARCHAR(50) NOT NULL,
  account_name VARCHAR(255),
  account_id VARCHAR(255),
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expires_in INTEGER NOT NULL,
  obtained_at BIGINT NOT NULL,
  config JSONB,
  UNIQUE(user_id, marketplace, account_id)
);

-- Migrar dados da tabela 'tokens' para a nova tabela 'accounts'
INSERT INTO accounts (user_id, marketplace, account_name, account_id, access_token, refresh_token, expires_in, obtained_at, config)
SELECT 
  user_id, 
  marketplace, 
  CASE 
    WHEN marketplace = 'mercadolivre' THEN 'Mercado Livre'
    WHEN marketplace = 'shopee' THEN 'Shopee'
    WHEN marketplace = 'amazon' THEN 'Amazon'
    ELSE marketplace
  END as account_name,
  'default' as account_id,
  access_token, 
  refresh_token, 
  expires_in, 
  obtained_at,
  '{}'::jsonb as config
FROM tokens
ON CONFLICT (user_id, marketplace, account_id) DO UPDATE SET
  access_token = EXCLUDED.access_token,
  refresh_token = EXCLUDED.refresh_token,
  expires_in = EXCLUDED.expires_in,
  obtained_at = EXCLUDED.obtained_at;

-- Não vamos remover a tabela 'tokens' ainda para manter compatibilidade com o código existente
-- DROP TABLE tokens;

