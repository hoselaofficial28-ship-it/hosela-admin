import { NextRequest, NextResponse } from 'next/server';
import { isCustomOrderSetupMissing, purgeExpiredCustomPhotos } from '@/lib/custom-orders';

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    await purgeExpiredCustomPhotos();
    return NextResponse.json({ success: true });
  } catch (error) {
    if (isCustomOrderSetupMissing(error)) return NextResponse.json({ success: true, setup_required: true });
    throw error;
  }
}
