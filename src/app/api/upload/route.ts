import { NextResponse } from 'next/server';
import { writeFile, mkdir, access } from 'node:fs/promises';
import path from 'node:path';
import { requireAuth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const ALLOWED_EXTENSIONS = ['.csv', '.xlsx', '.pdf'];

export async function POST(req: Request) {
  const auth = await requireAuth();
  if (auth instanceof Response) return auth;
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const rawProjectName = String(formData.get('projectName') || '').trim();

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    const ext = path.extname(file.name).toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return NextResponse.json(
        { error: 'Only CSV, XLSX, and PDF files are allowed' },
        { status: 400 }
      );
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const uploadsDir = path.join(process.cwd(), 'public', 'uploads');
    await mkdir(uploadsDir, { recursive: true });

    let baseName = '';
    if (rawProjectName) {
      baseName = rawProjectName.replace(/[^a-zA-Z0-9_-]/g, '_');
    } else {
      baseName = path.basename(file.name, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
    }

    if (!baseName) baseName = 'document';

    let filename = `${baseName}${ext}`;
    let filePath = path.join(uploadsDir, filename);

    // If file exists, append timestamp suffix to avoid overwriting existing document
    try {
      await access(filePath);
      filename = `${baseName}_${Date.now()}${ext}`;
      filePath = path.join(uploadsDir, filename);
    } catch {
      // File does not exist yet
    }

    await writeFile(filePath, buffer);

    const fileUrl = `/uploads/${filename}`;
    return NextResponse.json({
      url: fileUrl,
      filename: filename,
      size: file.size,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to upload file' },
      { status: 500 }
    );
  }
}
