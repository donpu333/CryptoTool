class WebSocketManager {
    constructor(chartManager) {
        this.chartManager = chartManager;
        this.wsKline = null;
        this.klineReconnectTimer = null;
        this.currentSymbol = 'BTCUSDT';
        this.currentInterval = '1h';
        this.currentExchange = 'binance';
    }

    connectKline(symbol, interval, exchange, marketType) {
    if (this.klineReconnectTimer) {
        clearTimeout(this.klineReconnectTimer);
        this.klineReconnectTimer = null;
    }
    
    if (this.wsKline) {
        this.wsKline.onclose = null;
        this.wsKline.onerror = null;
        this.wsKline.onmessage = null;
        try { this.wsKline.close(); } catch(e) {}
        this.wsKline = null;
    }

    this.currentSymbol = symbol;
    this.currentInterval = interval;
    this.currentExchange = exchange;

    const streamName = `${symbol.toLowerCase()}@kline_${interval}`;
    const wsUrl = (exchange === 'binance' && marketType === 'spot')
        ? `wss://stream.binance.com:9443/ws/${streamName}`
        : `wss://fstream.binance.com/ws/${streamName}`;

    console.log('🔌 Kline подключение:', wsUrl);

    // Ждём полного закрытия старого сокета
    setTimeout(() => {
        this.wsKline = new WebSocket(wsUrl);
        
        this.wsKline.onopen = () => console.log('✅ Kline WebSocket открыт');
        
        this.wsKline.onmessage = (event) => {
            const data = JSON.parse(event.data);
            if (!data.k) return;
            
            const k = data.k;
            const isFinal = k.x; // true = свеча закрыта
            
            // Выравниваем время по началу интервала [citation:5]
            const intervalSeconds = {
                '1m': 60, '3m': 180, '5m': 300, '15m': 900, '30m': 1800,
                '1h': 3600, '4h': 14400, '6h': 21600, '12h': 43200,
                '1d': 86400, '1w': 604800, '1M': 2592000
            };
            const step = intervalSeconds[interval] || 3600;
            const time = Math.floor(k.t / 1000);
            const alignedTime = Math.floor(time / step) * step;
            
            const candle = {
                time: alignedTime,
                open: parseFloat(k.o),
                high: parseFloat(k.h),
                low: parseFloat(k.l),
                close: parseFloat(k.c),
                volume: parseFloat(k.v)
            };
            
            const cm = this.chartManager;
            if (!cm) return;
            
            // Обновляем последнюю свечу
            cm.currentRealPrice = parseFloat(k.c);
            if (cm.updateLastCandle) {
                cm.updateLastCandle(candle);
            }
            
            // Линия цены
            const series = cm.currentChartType === 'candle' ? cm.candleSeries : cm.barSeries;
            if (series) {
                series.applyOptions({ priceLineSource: parseFloat(k.c) });
            }
            
            // Индикаторы
            if (cm.indicatorManager) {
                cm.indicatorManager.updateAllIndicators();
            }
        };
        
        this.wsKline.onclose = () => {
            console.log('❌ Kline закрыт');
            this.wsKline = null;
            if (this.currentSymbol === symbol) {
                this.klineReconnectTimer = setTimeout(() => {
                    this.connectKline(symbol, interval, exchange, marketType);
                }, 3000);
            }
        };
        
        this.wsKline.onerror = () => {};
    }, 150);
}
    updateSymbolAndTimeframe(symbol, interval, exchange, marketType) {
        this.connectKline(symbol, interval, exchange, marketType);
    }

    closeAll() {
        if (this.wsKline) {
            try { this.wsKline.close(); } catch(e) {}
            this.wsKline = null;
        }
        if (this.klineReconnectTimer) clearTimeout(this.klineReconnectTimer);
    }
}
if (typeof window !== 'undefined') window.WebSocketManager = WebSocketManager;