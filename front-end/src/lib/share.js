const IMAGE_NAME = 'lhermyne-presidentielle-2027.png';
const TITLE = 'L’Hermyne - Présidentielle 2027';

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function copyLink(url) {
  try {
    await navigator.clipboard.writeText(url);
    return true;
  } catch {
    return false;
  }
}

function desktopMessage(copied, hasImage) {
  if (copied && hasImage) return 'Lien copié et image téléchargée : il ne reste qu’à les coller sur votre réseau.';
  if (copied) return 'Lien copié.';
  if (hasImage) return 'Image téléchargée. Copiez l’adresse de la page pour partager le lien.';
  return 'Copiez l’adresse de la page pour la partager.';
}

// Partage natif du téléphone avec l'image ; sur ordinateur, lien copié et image téléchargée.
// Renvoie le message à afficher, ou une chaîne vide si le partage natif suffit.
export async function shareForecast({ blob, sentence, url }) {
  const file = blob ? new File([blob], IMAGE_NAME, { type: 'image/png' }) : null;

  try {
    if (file && navigator.canShare?.({ files: [file] })) {
      // Plusieurs applications ignorent le champ url quand un fichier est joint : le lien va dans le texte.
      await navigator.share({ files: [file], title: TITLE, text: `${sentence} ${url}` });
      return '';
    }
    if (navigator.share) {
      await navigator.share({ title: TITLE, text: sentence, url });
      return '';
    }
  } catch (error) {
    if (error.name === 'AbortError') return '';
  }

  const copied = await copyLink(url);
  if (blob) downloadBlob(blob, IMAGE_NAME);
  return desktopMessage(copied, Boolean(blob));
}
