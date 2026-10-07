import { getLocale } from '@/lib/locale';
import { translator,turkish,localeOf,localizeFinding,localizeEvidence } from '@seo/shared/i18n';
import{NextResponse}from'next/server';import{db}from'@seo/db';export async function GET(_:Request,{params}:{params:Promise<{id:string}>}){const t=translator(await getLocale());const{id}=await params,c=await db.crawl.findUnique({where:{id},include:{_count:{select:{findings:true,exclusions:true}}}});return c?NextResponse.json(c):NextResponse.json({error:t("m157")},{status:404})}
