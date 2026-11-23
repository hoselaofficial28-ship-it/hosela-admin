import { NextRequest, NextResponse } from 'next/server';
import { getSession, canAccessFeature } from '@/lib/auth';
import { customOrderPhoto } from '@/lib/custom-orders';

export async function GET(req: NextRequest) {
  const user = await getSession();
  if (!user) return new NextResponse(null, { status: 401 });
  if (!canAccessFeature(user, 'input')) return new NextResponse(null, { status: 403 });
  const id = req.nextUrl.searchParams.get('id');
  const revision = Number(req.nextUrl.searchParams.get('revision'));
  if (!id || !Number.isSafeInteger(revision) || revision < 1) return new NextResponse(null, { status: 400 });
  const photo = await customOrderPhoto(id, revision);
  if (!photo?.startsWith('data:image/jpeg;base64,')) return new NextResponse(null, { status: 404, headers: { 'Cache-Control': 'no-store' } });
  return new NextResponse(Buffer.from(photo.slice('data:image/jpeg;base64,'.length), 'base64'), {
    headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' },
  });
}
