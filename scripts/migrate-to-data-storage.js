/**
 * Opcjonalny skrypt migracji (ręczne uruchomienie).
 * Aplikacja wykonuje migrację automatycznie przy pierwszym odczycie projektów
 * (getProjects), gdy wykryje legacy projects.json i pustą strukturę projects/.
 *
 * Ten skrypt można uruchomić ręcznie, jeśli wolisz migrację przed startem serwera:
 *   node scripts/migrate-to-data-storage.js
 */

const path = require('path');
const fs = require('fs').promises;

async function getDataDir() {
  try {
    await fs.access('/data-storage');
    return '/data-storage';
  } catch {
    return path.join(process.cwd(), 'data');
  }
}

async function main() {
  const dataDir = await getDataDir();
  const legacyPath = path.join(dataDir, 'projects.json');
  const projectsDir = path.join(dataDir, 'projects');
  const oldThumbBase = path.join(dataDir, 'thumbnails', 'design-revision');
  const oldGalleryBase = path.join(dataDir, 'thumbnails', 'design-gallery');

  let raw;
  try {
    raw = await fs.readFile(legacyPath, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.log('Brak pliku projects.json – nic do migracji.');
      return;
    }
    throw err;
  }

  let projects;
  try {
    projects = JSON.parse(raw);
  } catch (err) {
    console.error('Błąd parsowania projects.json:', err.message);
    process.exit(1);
  }

  if (!Array.isArray(projects) || projects.length === 0) {
    console.log('Brak projektów w projects.json.');
    return;
  }

  await fs.mkdir(projectsDir, { recursive: true });

  for (const project of projects) {
    const projectId = project.id;
    const projectPath = path.join(projectsDir, projectId);
    await fs.mkdir(projectPath, { recursive: true });

    const meta = {
      id: projectId,
      name: project.name || 'Projekt',
      slug: project.slug || null,
      description: project.description || null,
      createdAt: project.createdAt || new Date().toISOString(),
      revisionIds: (project.revisions || []).map((r) => r.id),
    };
    await fs.writeFile(
      path.join(projectPath, 'project.json'),
      JSON.stringify(meta, null, 2),
      'utf8'
    );

    const revisions = project.revisions || [];
    for (const rev of revisions) {
      const revId = rev.id;
      const revDir = path.join(projectPath, 'rewizje', revId);
      await fs.mkdir(revDir, { recursive: true });

      const oldThumbFile = path.join(oldThumbBase, projectId, `${revId}.webp`);
      const newThumbFile = path.join(revDir, 'thumbnail.webp');
      let thumbnailCopied = false;
      try {
        await fs.copyFile(oldThumbFile, newThumbFile);
        thumbnailCopied = true;
      } catch {
        // brak starej miniaturki – zostaw puste
      }

      const galleryDir = path.join(revDir, 'gallery');
      await fs.mkdir(galleryDir, { recursive: true });

      const oldGalleryDir = path.join(oldGalleryBase, projectId, revId);
      const galleryPaths = [];
      const oldPaths = rev.galleryPaths || [];
      for (const rel of oldPaths) {
        const parts = rel.split(/[/\\]/);
        const filename = parts[parts.length - 1];
        if (!filename) continue;
        const oldFile = path.join(oldGalleryBase, projectId, revId, filename);
        const newFile = path.join(galleryDir, filename);
        try {
          await fs.copyFile(oldFile, newFile);
          galleryPaths.push(filename);
        } catch {
          // plik mógł nie istnieć
        }
      }

      const revMeta = {
        id: rev.id,
        label: rev.label || null,
        description: rev.description || null,
        embedUrl: rev.embedUrl || null,
        createdAt: rev.createdAt || new Date().toISOString(),
        thumbnailPath: thumbnailCopied ? 'thumbnail.webp' : null,
        galleryPaths: galleryPaths.length ? galleryPaths : null,
      };
      await fs.writeFile(
        path.join(revDir, 'revision.json'),
        JSON.stringify(revMeta, null, 2),
        'utf8'
      );
    }

    console.log(`Zapisano projekt: ${project.name} (${projectId}), rewizji: ${revisions.length}`);
  }

  console.log('Migracja zakończona. Stare pliki (projects.json, thumbnails/design-*) nie zostały usunięte.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
