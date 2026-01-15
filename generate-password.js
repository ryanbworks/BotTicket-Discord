#!/usr/bin/env node

/**
 * Script para gerar hash de senhas para o sistema de autenticação
 * Uso: node generate-password.js
 */

import bcrypt from "bcryptjs";
import { createInterface } from "readline";

const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
});

console.log("🔐 Gerador de Hash de Senha - FOZ RP\n");
console.log("Este script gera hashes bcrypt para senhas de administradores.\n");

rl.question("Digite a senha para gerar o hash: ", async password => {
    if (!password || password.trim().length < 6) {
        console.error("❌ Erro: A senha deve ter pelo menos 6 caracteres!");
        rl.close();
        process.exit(1);
    }

    try {
        console.log("\n⏳ Gerando hash...\n");

        const hash = await bcrypt.hash(password.trim(), 10);

        console.log("✅ Hash gerado com sucesso!\n");
        console.log("═".repeat(60));
        console.log("\nCole este hash no arquivo src/web/auth.js:\n");
        console.log(`"${hash}"`);
        console.log("\n═".repeat(60));
        console.log("\nExemplo de uso:\n");
        console.log("const users = [");
        console.log("    {");
        console.log('        username: "seu_usuario",');
        console.log(`        passwordHash: "${hash}"`);
        console.log("    }");
        console.log("];\n");
    } catch (error) {
        console.error("❌ Erro ao gerar hash:", error.message);
        process.exit(1);
    }

    rl.close();
});

rl.on("close", () => {
    process.exit(0);
});
