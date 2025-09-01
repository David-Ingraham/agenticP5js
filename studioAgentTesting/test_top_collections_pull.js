import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create images directory if it doesn't exist
const imagesDir = path.join(__dirname, 'downloaded_images');
if (!fs.existsSync(imagesDir)) {
    fs.mkdirSync(imagesDir, { recursive: true });
}

async function downloadImage(url, filename) {
    try {
        console.log(`Downloading: ${filename}`);
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const buffer = await response.buffer();
        const filepath = path.join(imagesDir, filename);
        
        fs.writeFileSync(filepath, buffer);
        console.log(`✓ Saved: ${filename}`);
        return filepath;
    } catch (error) {
        console.error(`✗ Failed to download ${filename}:`, error.message);
        return null;
    }
}

async function getTopCollections() {
    try {
        console.log('Fetching top collections from Magic Eden...');
        
        const response = await fetch('https://api-mainnet.magiceden.dev/v2/marketplace/popular_collections');
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const collections = await response.json();
        console.log(`Found ${collections.length} collections`);
        
        return collections;
    } catch (error) {
        console.error('Failed to fetch collections:', error.message);
        return [];
    }
}

async function main() {
    console.log(' Starting Magic Eden Top Collections Image Downloader\n');
    
    // Get top collections
    const collections = await getTopCollections();
    
    if (collections.length === 0) {
        console.error('No collections found. Exiting.');
        return;
    }
    
    // Take top 5 collections
    const top5 = collections.slice(0, 5);
    
    console.log('\n Top 5 Collections:');
    top5.forEach((collection, index) => {
        console.log(`${index + 1}. ${collection.name} (${collection.symbol})`);
        console.log(`   Floor: ${(collection.floorPrice / 1e9).toFixed(2)} SOL`);
        console.log(`   Volume: ${collection.volumeAll.toFixed(2)} SOL`);
        console.log(`   Image: ${collection.image}`);
        console.log('');
    });
    
    console.log('Downloading images...\n');
    
    // Download images
    const downloadResults = [];
    for (let i = 0; i < top5.length; i++) {
        const collection = top5[i];
        const imageUrl = collection.image;
        
        if (!imageUrl) {
            console.log(`  No image URL for ${collection.name}`);
            continue;
        }
        
        // Extract file extension from URL or default to .png
        let extension = '.png';
        try {
            const url = new URL(imageUrl);
            const pathname = url.pathname;
            const ext = path.extname(pathname);
            if (ext) {
                extension = ext;
            }
        } catch (error) {
            // Use default extension if URL parsing fails
        }
        
        const filename = `${i + 1}_${collection.symbol}${extension}`;
        const filepath = await downloadImage(imageUrl, filename);
        
        downloadResults.push({
            rank: i + 1,
            name: collection.name,
            symbol: collection.symbol,
            floorPrice: collection.floorPrice,
            volumeAll: collection.volumeAll,
            imageUrl: imageUrl,
            localPath: filepath,
            downloaded: filepath !== null
        });
    }
    
    // Save metadata
    const metadataPath = path.join(imagesDir, 'collections_metadata.json');
    fs.writeFileSync(metadataPath, JSON.stringify(downloadResults, null, 2));
    
    console.log('\n Download Summary:');
    downloadResults.forEach(result => {
        const status = result.downloaded ? '✓' : '✗';
        console.log(`${status} ${result.name} - ${result.downloaded ? 'Downloaded' : 'Failed'}`);
    });
    
    console.log(`\n Files saved to: ${imagesDir}`);
    console.log(` Metadata saved to: ${metadataPath}`);
}

// Run the script
main().catch(console.error); 