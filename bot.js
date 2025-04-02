const fs = require('fs');
const TelegramBot = require('node-telegram-bot-api');
const conf = JSON.parse(fs.readFileSync('conf.json'));
const token = conf.key;

const bot = new TelegramBot(token, { polling: true });

let favorites = {};
let searchResults = {};
let searchOffsets = {};

// Funzione per cercare prodotti su eBay
const searchEbayProducts = (query, offset = 0) => {
    return new Promise((resolve, reject) => {
        const ebayApiUrl = `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${encodeURIComponent(query)}&limit=5&offset=${offset}&currency=EUR`;
        const headers = {
            'Authorization': `Bearer ${conf.ebay.access_token}`,
            'Content-Type': 'application/json',
            'X-EBAY-C-MARKETPLACE-ID': 'EBAY_IT'
        };

        fetch(ebayApiUrl, { 
            method: 'GET', headers: headers })
            .then(response => {
                console.log(`Response status: ${response.status}`);
                return response.json();
            })
            .then(data => {
                console.log('Response data:', JSON.stringify(data));
                if (!data.itemSummaries) {
                    console.error('No itemSummaries found in the response.');
                    resolve([]);
                } else {
                    resolve(data.itemSummaries);
                }
            })
            .catch(error => {
                console.error('Error fetching data from eBay:', error);
                reject(error);
            });
    });
};

// Gestire i messaggi
bot.on("message", async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;

    // Comando /start
    if (text === "/start") {
        bot.sendMessage(chatId, "Benvenuto! Inviami una categoria di prodotti o un comando per iniziare.");
    }

    // Comando /help
    else if (text === "/help") {
        const helpMessage = `
Ecco i comandi disponibili:
/start - Inizia a usare il bot
/search [keyword] - Cerca prodotti su eBay
/next - Mostra i risultati successivi della ricerca corrente
/back - Mostra i risultati precedenti della ricerca corrente
/addfavourite [numero prodotto] - Aggiungi un prodotto ai preferiti
/favourites - Mostra i tuoi prodotti preferiti
/remove [numero prodotto] - Rimuovi un prodotto dai preferiti
        `;
        bot.sendMessage(chatId, helpMessage);
    }

    // Comando /search
    else if (text.startsWith("/search ")) {
        const query = text.replace("/search ", "").trim();
        try {
            const products = await searchEbayProducts(query);
            if (products.length > 0) {
                searchResults[chatId] = { query, products };
                searchOffsets[chatId] = 0;
                for (let index = 0; index < products.length; index++) {
                    const product = products[index];
                    const message = `
#${index + 1}
Titolo: ${product.title}
Prezzo: ${product.price.value} ${product.price.currency}
Link: ${product.itemWebUrl}
                    `;
                    await bot.sendMessage(chatId, message);
                    if (product.image) {
                        await bot.sendPhoto(chatId, product.image.imageUrl);
                    }
                }
                bot.sendMessage(chatId, "Puoi aggiungere un prodotto ai preferiti usando il comando /addfavourite [numero prodotto]. Usa /next per vedere i risultati successivi o /back per tornare indietro.");
            } else {
                bot.sendMessage(chatId, "Nessun prodotto trovato per questa ricerca.");
            }
        } catch (error) {
            bot.sendMessage(chatId, "Si è verificato un errore durante la ricerca.");
        }
    }

    else if (text === "/next") {
        if (!searchResults[chatId] || !searchResults[chatId].query) {
            bot.sendMessage(chatId, "Non hai effettuato alcuna ricerca. Usa il comando /search [keyword] per iniziare.");
            return;
        }
    
        const query = searchResults[chatId].query;
        const offset = searchOffsets[chatId];
    
        try {
            const newOffset = offset + 5;
            const products = await searchEbayProducts(query, newOffset);
            if (products.length > 0) {
                for (let index = 0; index < products.length; index++) {
                    const product = products[index];
                    const message = `
    #${index + 1 + newOffset} // Corretto per mostrare il numero giusto
    Titolo: ${product.title}
    Prezzo: ${product.price.value} ${product.price.currency}
    Link: ${product.itemWebUrl}
                    `;
                    await bot.sendMessage(chatId, message);
                    if (product.image) {
                        await bot.sendPhoto(chatId, product.image.imageUrl);
                    }
                }
                searchOffsets[chatId] = newOffset;
            } else {
                bot.sendMessage(chatId, "Non ci sono altri risultati per questa ricerca.");
            }
        } catch (error) {
            bot.sendMessage(chatId, "Si è verificato un errore durante il caricamento dei risultati successivi.");
        }
    }

    else if (text === "/back") {
        if (!searchResults[chatId] || !searchResults[chatId].query) {
            bot.sendMessage(chatId, "Non hai effettuato alcuna ricerca. Usa il comando /search [keyword] per iniziare.");
            return;
        }
    
        const query = searchResults[chatId].query;
        const offset = searchOffsets[chatId];
    
        if (offset <= 0) {
            bot.sendMessage(chatId, "Sei già alla prima pagina dei risultati.");
            return;
        }
    
        try {
            const newOffset = Math.max(0, offset - 5);
            const products = await searchEbayProducts(query, newOffset);
            if (products.length > 0) {
                for (let index = 0; index < products.length; index++) {
                    const product = products[index];
                    const message = `
    #${index + 1 + newOffset} // Corretto per mostrare il numero giusto
    Titolo: ${product.title}
    Prezzo: ${product.price.value} ${product.price.currency}
    Link: ${product.itemWebUrl}
                    `;
                    await bot.sendMessage(chatId, message);
                    if (product.image) {
                        await bot.sendPhoto(chatId, product.image.imageUrl);
                    }
                }
                searchOffsets[chatId] = newOffset;
            } else {
                bot.sendMessage(chatId, "Non ci sono risultati precedenti per questa ricerca.");
            }
        } catch (error) {
            bot.sendMessage(chatId, "Si è verificato un errore durante il caricamento dei risultati precedenti.");
        }
    }

    else if (text === "/favourites") {
        const userFavorites = favorites[chatId] || [];
        if (userFavorites.length > 0) {
            userFavorites.forEach((item, index) => {
                bot.sendMessage(chatId, `
#${index + 1}
Titolo: ${item.title}
Prezzo: ${item.price.value} ${item.price.currency}
Link: ${item.itemWebUrl}
                `);
            });
        } else {
            bot.sendMessage(chatId, "Non hai prodotti preferiti.");
        }
    }

    else if (text.startsWith("/addfavorite ")) {
        const productIndex = parseInt(text.replace("/addfavorite ", "").trim()) - 1;
        const userResults = searchResults[chatId]?.products || [];
        if (userResults[productIndex]) {
            const product = userResults[productIndex];
            if (!favorites[chatId]) {
                favorites[chatId] = [];
            }
            favorites[chatId].push(product);
            bot.sendMessage(chatId, `Prodotto "${product.title}" aggiunto ai preferiti.`);
        } else {
            bot.sendMessage(chatId, "Prodotto non trovato. Assicurati di usare il numero corretto.");
        }
    }

    else if (text.startsWith("/remove ")) {
        const productIndex = parseInt(text.replace("/remove ", "").trim()) - 1;
        if (favorites[chatId]) {
            const removedProduct = favorites[chatId].splice(productIndex, 1);
            if (removedProduct.length > 0) {
                bot.sendMessage(chatId, `Prodotto "${removedProduct[0].title}" rimosso dai preferiti.`);
            } else {
                bot.sendMessage(chatId, "Prodotto non trovato. Assicurati di usare il numero corretto.");
            }
        } else {
            bot.sendMessage(chatId, "Non hai prodotti preferiti.");
        }
    }

    else {
        bot.sendMessage(chatId, "Comando non riconosciuto. Usa /help per vedere i comandi disponibili.");
    }
})



// Avvio del bot
console.log("Bot avviato e in ascolto dei messaggi...");