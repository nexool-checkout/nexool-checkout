import type {Metadata} from 'next';
import './globals.css';
export const metadata:Metadata={title:'Secure checkout',description:'Complete your order securely.',robots:{index:false,follow:false}};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>;}
