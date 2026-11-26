# Simulacro del examen teórico – Licencia de conducir San Isidro

Simulacro de examen multiple choice para practicar el examen teórico de la licencia de conducir del Municipio de San Isidro. Las preguntas están elaboradas a partir del *Manual de Educación Vial* del Municipio (edición marzo 2026).

## Cómo funciona

- Banco de 330 preguntas repartidas en 24 temas (`public/preguntas.json`).
- Cada examen toma 40 preguntas al azar cubriendo todos los temas, y mezcla el orden de las opciones.
- Se aprueba con el 70% de respuestas correctas (28 de 40).
- Al terminar muestra la corrección de cada pregunta, la respuesta correcta, una explicación y la página del manual.
- Guarda un historial de los exámenes realizados.

## Usarlo online

Está publicado con GitHub Pages. En la versión online, el historial se guarda en el navegador de cada persona.

## Usarlo en tu computadora

Requiere [Node.js](https://nodejs.org/). No tiene dependencias.

```
npm start
```

Abrí http://localhost:3000. En este modo el historial se guarda como archivos JSON en la carpeta `historial/`.

## Estructura

- `public/` – la web (HTML, CSS, JS y banco de preguntas). Es lo que se publica en GitHub Pages.
- `server.js` – servidor local que sirve la web y guarda el historial en `historial/`.
- `.github/workflows/pages.yml` – publica `public/` en GitHub Pages en cada push a `main`.

## Aviso

Es un material de práctica no oficial. Ante cualquier duda, la referencia es el manual oficial y la normativa vigente.
