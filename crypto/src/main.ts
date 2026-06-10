import { State } from './types';
import { Auth } from './auth';
import { Store } from './Store';
import { UI } from './UI';
import { RankingService } from './RankingService';
import { FinancialActions } from './FinancialActions';
import { CryptoActions } from './CryptoActions';
import { WeeklyStatsActions } from './WeeklyStatsActions';


/**
 * Класс App является главным координатором (Main Controller) приложения.
 * Он связывает Store, UI и Auth воедино.
 */
class App {
    private store: Store;
    private ui: UI;
    private isReady = false;

    constructor() {
        // 1. Initialize Store with a callback to UI update
        this.store = new Store((state) => {
            if (this.ui && this.isReady) this.ui.updateState(state);
        });
        (window as any).store = this.store;

        // 2. Initialize UI
        this.ui = new UI(this.store.getState(), this.handleAction.bind(this));

        // 3. Initialize Auth (парольный вход; onReady вызывается только после успешного входа)
        new Auth(async () => {
            try {
                await this.store.loadFromCloud();
            } catch (e) {
                // Нет доступа (просрочен/неверен пропуск) — пробрасываем, чтобы Auth показал экран пароля
                if ((e as Error).message === 'UNAUTHORIZED') throw e;
                console.error('Cloud load failed, using local state', e);
            }

            // Check Rankings
            const state = this.store.getState();
            if (state.cmcApiKey && RankingService.shouldUpdate(state.lastRankingsUpdate)) {
                this.fetchRankings(state.cmcApiKey);
            }

            // Enable UI and Render
            this.isReady = true;
            this.ui.updateState(state);
        });

        // 4. Attach Global Listeners via UI
        this.ui.attachGlobalListeners();
    }






    private handleAction(type: string, payload: unknown) {
        const state = this.store.getState();

        // 1. Delegate Financial Actions
        const finUpdates = FinancialActions.handle(state, type, payload);
        if (finUpdates) {
            this.store.updateState(finUpdates);
            return;
        }

        // 2. Delegate Weekly Stats Actions
        const weeklyUpdates = WeeklyStatsActions.handle(state, type, payload);
        if (weeklyUpdates) {
            this.store.updateState(weeklyUpdates);
            return;
        }

        // 3. Delegate Crypto Actions
        const cryptoUpdates = CryptoActions.handle(state, type, payload);
        if (cryptoUpdates) {
            this.store.updateState(cryptoUpdates);

            // Special side effects
            if (type === 'UPDATE_CMC_KEY' || type === 'UPDATE_RANKINGS_FORCE') {
                const key = (cryptoUpdates.cmcApiKey as string) || state.cmcApiKey;
                if (key) {
                    if (type === 'UPDATE_RANKINGS_FORCE' || RankingService.shouldUpdate(state.lastRankingsUpdate)) {
                        this.fetchRankings(key);
                    }
                } else if (type === 'UPDATE_RANKINGS_FORCE') {
                    alert('Сначала введите CMC API Key в настройках!');
                }
            }
            return;
        }

        // 3. System-wide Actions or ones with complex side effects
        switch (type) {
            case 'TOGGLE_THEME': {
                const current = document.documentElement.getAttribute('data-theme') || 'dark';
                const next = current === 'dark' ? 'light' : 'dark';
                document.documentElement.setAttribute('data-theme', next);
                this.store.updateState({ theme: next });
                break;
            }
            case 'EXPORT_DATA':
                this.exportData(state);
                break;
            case 'IMPORT_STATE':
                this.store.updateState(payload as State);
                break;
            case 'UPDATE_RANKINGS_FORCE': {
                const key = state.cmcApiKey;
                if (!key) {
                    alert('Сначала введите CMC API Key в настройках!');
                    return;
                }
                this.fetchRankings(key);
                break;
            }
        }
    }

    private async fetchRankings(apiKey: string) {
        console.log('App: Initiating Ranking Update...');
        try {
            const rankings = await RankingService.fetchRankings(apiKey);
            this.store.updateRankings(rankings);
            console.log('App: Rankings updated in store.');
        } catch (error) {
            console.error('App: Error updating rankings:', error);
            alert('Ошибка обновления рейтинга: ' + (error as Error).message);
        }
    }

    private exportData(state: State) {
        const data = JSON.stringify(state, null, 2);
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `crypto_manager_backup_${new Date().toISOString().split('T')[0]}.json`;
        a.click();
    }

}

new App();
