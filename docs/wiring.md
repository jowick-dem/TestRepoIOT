# Wiring Reference — Smart Home Rendang

## ESP32 DevKit Pin Map

```
ESP32 Pin  │ Connected To          │ Notes
───────────┼───────────────────────┼──────────────────────────
GPIO 4     │ DHT22 DATA            │ 10kΩ pull-up to 3.3V
GPIO 16    │ MOSFET Gate — Teras   │ PWM channel 0
GPIO 17    │ MOSFET Gate — Tamu    │ PWM channel 1
GPIO 18    │ MOSFET Gate — Tidur   │ PWM channel 2
GPIO 19    │ MOSFET Gate — Dapur   │ PWM channel 3
GPIO 23    │ Gate Servo Signal     │ 500–2400µs pulse
GND        │ Common GND            │
3.3V       │ DHT22 VCC             │
5V (VIN)   │ Servo VCC             │
```

## MOSFET Circuit (per channel)

```
ESP32 GPIO ──[100Ω]──┬── MOSFET Gate (IRLZ44N)
                     │
                    [10kΩ]
                     │
                    GND

12V+ ── LED Strip (+) ── LED Strip (-) ── MOSFET Drain
                                         MOSFET Source ── GND
```

## DHT22 Wiring

```
DHT22 Pin 1 (VCC) ── 3.3V
DHT22 Pin 2 (DATA) ─[10kΩ]─ 3.3V
                  └── GPIO 4
DHT22 Pin 4 (GND) ── GND
```

## Gate Servo

```
Servo Red   ── 5V
Servo Brown ── GND
Servo Orange── GPIO 23
```

## ESP32-CAM (AI Thinker) Notes

- Power: 5V via AMS1117 regulator (do NOT use 3.3V pin directly for power)
- Flash LED is on GPIO 4 — disable it to avoid interfering with camera
- Use FTDI adapter (3.3V logic) for programming; connect IO0 to GND during upload
