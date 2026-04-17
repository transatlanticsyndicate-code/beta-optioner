

interface CoinMarketCapData {
    symbol: string;
    cmc_rank: number;
}

export class RankingService {
    // Use local proxy path configured in vite.config.ts
    // This forwards /cmc-api requests to https://pro-api.coinmarketcap.com
    private static readonly CMC_API_URL = '/cmc-api/v1/cryptocurrency/listings/latest';

    /**
     * Fetches the latest rankings from CoinMarketCap.
     * @param apiKey The user's CoinMarketCap API Key.
     * @returns A map of { Ticker: Rank } (e.g., { "BTC": 1, "ETH": 2 })
     */
    static async fetchRankings(apiKey: string): Promise<Record<string, number>> {
        if (!apiKey) {
            throw new Error('API Key is missing');
        }

        try {
            console.log('CMC: Starting fetchRankings...');
            // We fetch top 5000 to cover most assets
            const url = `${this.CMC_API_URL}?start=1&limit=5000&convert=USD`;
            console.log('CMC: Fetching URL:', url);

            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'X-CMC_PRO_API_KEY': apiKey,
                    'Accept': 'application/json'
                }
            });

            console.log('CMC: Response status:', response.status);

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                console.error('CMC: Request failed', errorData);
                throw new Error(`CMC API Error: ${response.status} ${errorData.status?.error_message || response.statusText}`);
            }

            const data = await response.json();

            if (!data.data || !Array.isArray(data.data)) {
                console.error('CMC: Invalid data format received', data);
                throw new Error('Invalid response format from CMC');
            }

            console.log(`CMC: Successfully fetched ${data.data.length} rankings.`);

            const rankings: Record<string, number> = {};
            data.data.forEach((coin: CoinMarketCapData) => {
                // Ensure symbol is uppercase
                const symbol = coin.symbol.toUpperCase();
                // If duplicate exists, keep the best (lowest) rank
                if (rankings[symbol]) {
                    rankings[symbol] = Math.min(rankings[symbol], coin.cmc_rank);
                } else {
                    rankings[symbol] = coin.cmc_rank;
                }
            });

            return rankings;

        } catch (error) {
            console.error('CMC: Failed to fetch rankings:', error);
            throw error;
        }
    }

    /**
     * Checks if rankings need to be updated (older than 24 hours).
     */
    static shouldUpdate(lastUpdate: number): boolean {
        const createTime = lastUpdate || 0;
        const now = Date.now();
        const oneDayMs = 24 * 60 * 60 * 1000;
        return (now - createTime) > oneDayMs;
    }
}
