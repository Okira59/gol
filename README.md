# Gol Analiz — iddaa / futbol veri toplama ve kupon

`Okira59/Pyhton` deposundaki `gol/` klasöründen (commit geçmişiyle birlikte) taşındı.

Son 3 ayın maçlarını toplayıp gol/oran istatistikleri çıkarır, yaklaşan maçlar için kupon ve skor olasılıkları üretir.

| Script | Ne yapar |
|---|---|
| `iddaa_collect.py` | iddaa.com bülteninden maç programı + oranları ve son günlerin sonuçlarını `data/iddaa.json`'a ekler |
| `fs_collect.py` | Flashscore'dan lig sonuçlarını (İY/MS skorları) ve Bet365 / William Hill oranlarını `data/fs_matches.json`, `data/fs_odds.json`'a toplar (`--days N`) |
| `fs_upcoming.py` | Flashscore'dan önümüzdeki 36 saatin maçlarını ve oranlarını `data/fs_upcoming.json`'a yazar (İY/MS kuponları için) |
| `leagues.py` | Takip edilen liglerin listesi |
| `build.py` | `data/*.json` dosyalarından panelin okuduğu sade `matches.json` dosyasını üretir |
| `kupon.py` | Marjı temizlenmiş oran + geçmiş düzeltmesiyle olasılık hesaplayıp 2-4 maçlık kuponlar (Üst/Alt, İY/MS) üretir ve sonuçlandırır → `kuponlar.json`, `bulten.json` |
| `skor.py` | Oranlardan Poisson modeliyle İY / MS skor olasılıklarını hesaplar → `skorlar.json` |

## Kurulum
```bash
pip install -r requirements.txt
```

## Çalıştırma (sırasıyla)
```bash
python iddaa_collect.py
python fs_collect.py --days 3
python fs_upcoming.py
python build.py ../docs/gol/data/matches.json
python kupon.py
python skor.py
```

> Not: `kupon.py` ve `skor.py` çıktılarını `../docs/gol/data/` klasörüne yazar (eski depo düzeni: panel `Okira59/Pyhton/docs/gol/`).
> `Okira59/toto` projesi `fs_collect.py`, `kupon.py` ve `skor.py` modüllerini kullanır.
