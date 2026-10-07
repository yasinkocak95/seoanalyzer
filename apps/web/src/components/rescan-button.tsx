'use client';

import {useLocale,useTranslation} from './language';
import {numberLocale,translator,localizeEvidence,type Locale} from '@seo/shared/i18n';
import{useState}from'react';import{useRouter}from'next/navigation';import{LoaderCircle,RotateCw}from'lucide-react';
export function RescanButton({url,full=false,label}:{url:string;full?:boolean;label?:string}){const t=useTranslation(),locale=useLocale();const[busy,setBusy]=useState(false),[error,setError]=useState(''),router=useRouter();async function rescan(){setBusy(true);setError('');try{const r=await fetch('/api/crawls',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({url,force:true,full})}),d=await r.json();if(!r.ok)throw new Error(t(d.error ?? t("m051")));router.push(`/tarama/${d.id}`)}catch(e){setError(e instanceof Error?e.message:t("m051"));setBusy(false)}}return <><button className="btn" disabled={busy} onClick={rescan} title={t("m052")}>{busy?<LoaderCircle className="animate-spin" size={17}/>:<RotateCw size={17}/>}{label??t(t("m323"))}</button>{error&&<p role="alert" className="w-full text-sm font-semibold text-red-700">{error}</p>}</>}
