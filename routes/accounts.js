const express = require("express");
const router = express.Router();
const pool = require("../database.js");

// Recupera todas as contas do usuário
const getAccountsFromDB = async (userId) => {
  const client = await pool.connect();
  try {
    const res = await client.query(
      "SELECT id, user_id, marketplace, account_name, account_id, obtained_at, expires_in, config FROM accounts WHERE user_id = $1",
      [userId]
    );
    return res.rows;
  } finally {
    client.release();
  }
};

// Recupera uma conta específica
const getAccountFromDB = async (userId, accountId) => {
  const client = await pool.connect();
  try {
    const res = await client.query(
      "SELECT id, user_id, marketplace, account_name, account_id, obtained_at, expires_in, config FROM accounts WHERE id = $1 AND user_id = $2",
      [accountId, userId]
    );
    return res.rows[0];
  } finally {
    client.release();
  }
};

// Atualiza configurações de uma conta
const updateAccountConfig = async (userId, accountId, config) => {
  const client = await pool.connect();
  try {
    await client.query(
      "UPDATE accounts SET config = $1 WHERE id = $2 AND user_id = $3",
      [config, accountId, userId]
    );
  } finally {
    client.release();
  }
};

// Remove uma conta
const removeAccount = async (userId, accountId) => {
  const client = await pool.connect();
  try {
    await client.query(
      "DELETE FROM accounts WHERE id = $1 AND user_id = $2",
      [accountId, userId]
    );
  } finally {
    client.release();
  }
};

// Endpoint para listar todas as contas do usuário
router.get("/", async (req, res) => {
  const userId = "default_user"; // Será substituído pelo ID do usuário autenticado
  
  try {
    const accounts = await getAccountsFromDB(userId);
    
    // Adicionar informações visuais para cada marketplace
    const enhancedAccounts = accounts.map(account => {
      let logo, color;
      
      switch (account.marketplace) {
        case "mercadolivre":
          logo = "https://dsseller.com.br/assets/mercado-livre.png";
          color = "#00ff55";
          break;
        case "shopee":
          logo = "https://dsseller.com.br/assets/shopee.png";
          color = "#ff5500";
          break;
        case "amazon":
          logo = "https://dsseller.com.br/assets/amazon.png";
          color = "#ffaa00";
          break;
        default:
          logo = "https://dsseller.com.br/assets/default.png";
          color = "#cccccc";
      }
      
      // Determinar status da conta
      const expirationTime = Number(account.obtained_at) + account.expires_in * 1000;
      const isExpired = Date.now() >= expirationTime - 5 * 60 * 1000; // 5 minutos de margem
      
      return {
        ...account,
        logo,
        color,
        status: isExpired ? "expired" : "active",
        id: account.id.toString() // Garantir que o ID seja uma string
      };
    });
    
    res.json(enhancedAccounts);
  } catch (error) {
    console.error("Erro ao listar contas:", error);
    res.status(500).json({ message: "Erro ao listar contas", error: error.message });
  }
});

// Endpoint para obter uma conta específica
router.get("/:id", async (req, res) => {
  const userId = "default_user"; // Será substituído pelo ID do usuário autenticado
  const { id } = req.params;
  
  try {
    const account = await getAccountFromDB(userId, id);
    
    if (!account) {
      return res.status(404).json({ message: "Conta não encontrada" });
    }
    
    // Adicionar informações visuais
    let logo, color;
    
    switch (account.marketplace) {
      case "mercadolivre":
        logo = "https://dsseller.com.br/assets/mercado-livre.png";
        color = "#00ff55";
        break;
      case "shopee":
        logo = "https://dsseller.com.br/assets/shopee.png";
        color = "#ff5500";
        break;
      case "amazon":
        logo = "https://dsseller.com.br/assets/amazon.png";
        color = "#ffaa00";
        break;
      default:
        logo = "https://dsseller.com.br/assets/default.png";
        color = "#cccccc";
    }
    
    // Determinar status da conta
    const expirationTime = Number(account.obtained_at) + account.expires_in * 1000;
    const isExpired = Date.now() >= expirationTime - 5 * 60 * 1000; // 5 minutos de margem
    
    const enhancedAccount = {
      ...account,
      logo,
      color,
      status: isExpired ? "expired" : "active",
      id: account.id.toString() // Garantir que o ID seja uma string
    };
    
    res.json(enhancedAccount);
  } catch (error) {
    console.error("Erro ao obter conta:", error);
    res.status(500).json({ message: "Erro ao obter conta", error: error.message });
  }
});

// Endpoint para atualizar configurações de uma conta
router.put("/:id", async (req, res) => {
  const userId = "default_user"; // Será substituído pelo ID do usuário autenticado
  const { id } = req.params;
  const { config } = req.body;
  
  try {
    // Verificar se a conta existe
    const account = await getAccountFromDB(userId, id);
    
    if (!account) {
      return res.status(404).json({ message: "Conta não encontrada" });
    }
    
    // Atualizar configurações
    await updateAccountConfig(userId, id, config);
    
    res.json({ message: "Configurações atualizadas com sucesso" });
  } catch (error) {
    console.error("Erro ao atualizar configurações:", error);
    res.status(500).json({ message: "Erro ao atualizar configurações", error: error.message });
  }
});

// Endpoint para remover uma conta
router.delete("/:id", async (req, res) => {
  const userId = "default_user"; // Será substituído pelo ID do usuário autenticado
  const { id } = req.params;
  
  try {
    // Verificar se a conta existe
    const account = await getAccountFromDB(userId, id);
    
    if (!account) {
      return res.status(404).json({ message: "Conta não encontrada" });
    }
    
    // Remover conta
    await removeAccount(userId, id);
    
    res.json({ message: "Conta removida com sucesso" });
  } catch (error) {
    console.error("Erro ao remover conta:", error);
    res.status(500).json({ message: "Erro ao remover conta", error: error.message });
  }
});

// Endpoint para verificar status de todas as contas
router.get("/status", async (req, res) => {
  const userId = "default_user"; // Será substituído pelo ID do usuário autenticado
  
  try {
    const accounts = await getAccountsFromDB(userId);
    
    const accountsStatus = accounts.map(account => {
      const expirationTime = Number(account.obtained_at) + account.expires_in * 1000;
      const isExpired = Date.now() >= expirationTime - 5 * 60 * 1000; // 5 minutos de margem
      
      return {
        id: account.id.toString(),
        marketplace: account.marketplace,
        account_id: account.account_id,
        status: isExpired ? "expired" : "active"
      };
    });
    
    res.json(accountsStatus);
  } catch (error) {
    console.error("Erro ao verificar status das contas:", error);
    res.status(500).json({ message: "Erro ao verificar status das contas", error: error.message });
  }
});

module.exports = router;

