// Image de partage : le duel le plus probable, dessiné comme le hero du site.
// Le même dessin sert au partage mobile et à l'aperçu de lien généré à la publication.
import { dateLabel, percent, shortName } from './format.js';

export const CARD_WIDTH = 1200;
export const CARD_HEIGHT = 630;

const SITE_LABEL = 'lhermyne.github.io/Presidentielle-2027';
const DISPLAY_FONT = '"Bricolage Grotesque Variable", system-ui, sans-serif';
const TEXT_FONT = '"Instrument Sans Variable", system-ui, sans-serif';
const COLORS = { background: '#100e0b', ink: '#f3ecdf', soft: '#d3cabb', muted: '#b7ad9c', accent: '#ef7655' };
const PORTRAIT_SIZE = 148;
const SIDE_MARGIN = 64;
const BAR = { top: 424, height: 22, hatch: 12 };
// Part de blanc mêlée aux couleurs de candidats sur fond sombre, comme sur le site.
const TINT_AMOUNT = 0.3;

function hexToRgb(hex) {
  const value = Number.parseInt(hex.replace('#', ''), 16);
  return [value >> 16 & 255, value >> 8 & 255, value & 255];
}

function tinted(hex) {
  const channels = hexToRgb(hex).map(channel => Math.round(channel + (255 - channel) * TINT_AMOUNT));
  return `rgb(${channels.join(', ')})`;
}

function translucent(hex, alpha) {
  return `rgba(${hexToRgb(hex).join(', ')}, ${alpha})`;
}

function plainNumber(value) {
  return percent(value).replace(' %', '');
}

// Données de la carte, ou null si le duel le plus probable n'a pas de score projeté.
export function duelCardData(result) {
  const pair = result?.pairs?.[0];
  if (!pair?.projection) return null;

  const ids = pair.key.split('|');
  const finalists = result.rows.filter(row => ids.includes(row.id));
  if (finalists.length !== 2) return null;

  const [left, right] = finalists;
  return {
    left,
    right,
    score: pair.projection.scores[left.id],
    lower: pair.projection.lower[left.id],
    upper: pair.projection.upper[left.id],
  };
}

export function shareSentence(card) {
  const { left, right, score } = card;
  return `Présidentielle 2027, second tour le plus probable : ${shortName(left.name)} ${percent(score)}, ${shortName(right.name)} ${percent(100 - score)}. Projection expérimentale.`;
}

async function loadFonts() {
  const specs = [`300 120px ${DISPLAY_FONT}`, `500 30px ${DISPLAY_FONT}`, `400 20px ${TEXT_FONT}`];
  await Promise.all(specs.map(spec => document.fonts.load(spec)));
}

function loadImage(source) {
  return new Promise(resolve => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = source;
  });
}

function drawHalo(context, x, color) {
  const gradient = context.createRadialGradient(x, 230, 0, x, 230, 560);
  gradient.addColorStop(0, translucent(color, 0.72));
  gradient.addColorStop(1, translucent(color, 0));
  context.fillStyle = gradient;
  context.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
}

function drawPortrait(context, image, row, x, y) {
  const radius = PORTRAIT_SIZE / 2;
  const centerX = x + radius;
  const centerY = y + radius;

  context.save();
  context.beginPath();
  context.arc(centerX, centerY, radius, 0, Math.PI * 2);
  context.clip();
  context.fillStyle = '#1f1b14';
  context.fillRect(x, y, PORTRAIT_SIZE, PORTRAIT_SIZE);
  if (image) {
    context.drawImage(image, x, y, PORTRAIT_SIZE, PORTRAIT_SIZE);
  } else {
    context.fillStyle = COLORS.soft;
    context.font = `500 44px ${DISPLAY_FONT}`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(row.name.split(' ').map(word => word[0]).slice(0, 2).join(''), centerX, centerY);
  }
  context.restore();

  context.beginPath();
  context.arc(centerX, centerY, radius + 6, 0, Math.PI * 2);
  context.strokeStyle = 'rgba(243, 236, 223, 0.22)';
  context.lineWidth = 2;
  context.stroke();
}

function drawFinalist(context, { row, image, score, alignRight }) {
  const portraitX = alignRight ? CARD_WIDTH - SIDE_MARGIN - PORTRAIT_SIZE : SIDE_MARGIN;
  const textX = alignRight ? portraitX - 30 : portraitX + PORTRAIT_SIZE + 30;
  drawPortrait(context, image, row, portraitX, 196);

  context.textAlign = alignRight ? 'right' : 'left';
  context.textBaseline = 'alphabetic';
  context.fillStyle = COLORS.ink;
  context.font = `300 120px ${DISPLAY_FONT}`;
  const number = plainNumber(score);
  const numberWidth = context.measureText(number).width;
  context.font = `300 46px ${DISPLAY_FONT}`;
  const unitWidth = context.measureText('%').width + 6;

  context.font = `300 120px ${DISPLAY_FONT}`;
  context.fillText(number, alignRight ? textX - unitWidth : textX, 300);
  context.font = `300 46px ${DISPLAY_FONT}`;
  context.fillStyle = COLORS.soft;
  context.fillText('%', alignRight ? textX : textX + numberWidth + 6, 300);

  context.fillStyle = COLORS.ink;
  context.font = `500 30px ${DISPLAY_FONT}`;
  context.fillText(row.name, textX, 344);
}

function drawDuelBar(context, card) {
  const width = CARD_WIDTH - SIDE_MARGIN * 2;
  const leftColor = tinted(card.left.color);
  const rightColor = tinted(card.right.color);
  const toX = value => SIDE_MARGIN + width * value / 100;

  context.save();
  context.beginPath();
  context.roundRect(SIDE_MARGIN, BAR.top, width, BAR.height, BAR.height / 2);
  context.clip();
  context.fillStyle = rightColor;
  context.fillRect(SIDE_MARGIN, BAR.top, width, BAR.height);
  context.fillStyle = leftColor;
  context.fillRect(SIDE_MARGIN, BAR.top, toX(card.lower) - SIDE_MARGIN, BAR.height);

  // Zone hachurée : l'intervalle à 90 %.
  context.beginPath();
  context.rect(toX(card.lower), BAR.top, toX(card.upper) - toX(card.lower), BAR.height);
  context.clip();
  context.strokeStyle = leftColor;
  context.lineWidth = BAR.hatch / 2;
  for (let x = toX(card.lower) - BAR.height; x < toX(card.upper) + BAR.height; x += BAR.hatch) {
    context.beginPath();
    context.moveTo(x, BAR.top + BAR.height);
    context.lineTo(x + BAR.height, BAR.top);
    context.stroke();
  }
  context.restore();

  context.fillStyle = COLORS.ink;
  context.fillRect(CARD_WIDTH / 2 - 1, BAR.top - 4, 2, BAR.height + 8);
  context.font = `400 18px ${TEXT_FONT}`;
  context.fillStyle = COLORS.soft;
  context.textAlign = 'center';
  context.fillText('50 %', CARD_WIDTH / 2, BAR.top + BAR.height + 28);
}

function drawTexts(context, asOf) {
  context.textBaseline = 'alphabetic';

  context.textAlign = 'left';
  context.fillStyle = COLORS.ink;
  context.font = `500 26px ${DISPLAY_FONT}`;
  context.fillText('L’Hermyne - Présidentielle 2027', SIDE_MARGIN, 62);

  context.textAlign = 'right';
  context.fillStyle = COLORS.soft;
  context.font = `400 20px ${TEXT_FONT}`;
  context.fillText(`Données du ${dateLabel(asOf)}`, CARD_WIDTH - SIDE_MARGIN, 60);

  context.textAlign = 'center';
  context.fillStyle = COLORS.ink;
  context.font = `500 40px ${DISPLAY_FONT}`;
  context.fillText('Le second tour le plus probable', CARD_WIDTH / 2, 142);

  context.fillStyle = COLORS.muted;
  context.font = `400 20px ${TEXT_FONT}`;
  context.textAlign = 'left';
  context.fillText('Projection expérimentale, pas un pronostic', SIDE_MARGIN, 570);
  context.textAlign = 'right';
  context.fillStyle = COLORS.soft;
  context.fillText(SITE_LABEL, CARD_WIDTH - SIDE_MARGIN, 570);
}

export async function drawShareCard(canvas, card, asOf) {
  canvas.width = CARD_WIDTH;
  canvas.height = CARD_HEIGHT;
  const context = canvas.getContext('2d');
  const base = import.meta.env.BASE_URL;

  const [leftImage, rightImage] = await Promise.all([
    card.left.photo ? loadImage(`${base}${card.left.photo}`) : null,
    card.right.photo ? loadImage(`${base}${card.right.photo}`) : null,
    loadFonts(),
  ]);

  context.fillStyle = COLORS.background;
  context.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
  drawHalo(context, 0, card.left.color);
  drawHalo(context, CARD_WIDTH, card.right.color);

  drawTexts(context, asOf);
  drawFinalist(context, { row: card.left, image: leftImage, score: card.score, alignRight: false });
  drawFinalist(context, { row: card.right, image: rightImage, score: 100 - card.score, alignRight: true });
  drawDuelBar(context, card);
}

export async function shareCardBlob(card, asOf) {
  const canvas = document.createElement('canvas');
  await drawShareCard(canvas, card, asOf);
  return new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
}
