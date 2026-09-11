# Sistema IoT: Monitor de Temperatura y Control de LED Bidireccional
## Arduino Nano ESP32 + MQTT (Flespi Cloud) + GitHub Pages

Este proyecto implementa una arquitectura IoT profesional en la nube para el **Arduino Nano ESP32 (ESP32-S3)**:
1. **Telemetría en tiempo real**: Lee un voltaje analógico de **0 a 3.0V** (simulado por un potenciómetro en pin **A0**), calcula la temperatura (**0 a 100 °C**) y la publica cada segundo mediante **MQTT** al broker cloud **Flespi**.
2. **Control Bidireccional de LED**:
   - **Botón en Dashboard Web**: Enciende y apaga el LED del Arduino remotamente desde cualquier parte del mundo.
   - **Botón Físico en Arduino (Pin D2)**: Un pulsador físico conmuta el LED localmente y sincroniza de inmediato el nuevo estado hacia la nube.
   - **LED Virtual Reactivo**: Un indicador gráfico luminoso en la interfaz web cambia de estado (Encendido/Apagado), emite brillo y permite personalizar su color.
3. **Frontend Desplegado en GitHub Pages**: Interfaz web estática moderna (HTML5, CSS3 y JavaScript con `MQTT.js`) accesible de forma pública mediante HTTPS y WebSockets Seguros (`wss://`).

---

## 📐 Esquema de Conexiones de Hardware

```text
       Arduino Nano ESP32                         Componentes Externos
     +--------------------+
     |                    |
     |                3.3V|-------------------+ (Extremo alimentación potenciómetro)
     |                    |                   |
     |                  A0|-------------+     |  [ Potenciómetro 10k ]
     |                    |             |     |   Pin 1: 3.3V
     |                 GND|--------+    +-------- Pin 2: Cursor central -> A0
     |                    |        |          |   Pin 3: GND
     |                  D2|----+   |          |
     |                    |    |   +----------+
     |             LED_B/D13|  |   |
     +--------------------+    |   |             [ Pulsador Físico ]
                               +---|------------ Pin A (Entrada D2 con Pull-Up)
                                   +------------ Pin B (Conectado a GND)
```

> [!NOTE]
> - **Pin A0**: Entrada analógica para la señal de temperatura (0 a 3.0V).
> - **Pin D2**: Entrada digital configurada con `INPUT_PULLUP`. Al pulsar el botón, el pin se conecta a GND (`LOW`) y conmuta el LED.
> - **Pin D13 / LED_BUILTIN**: LED de prueba en la placa del Arduino Nano ESP32.

---

