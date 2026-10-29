const key='nexool.checkout.session.v1';
export function checkoutToken(){
 const explicit=new URLSearchParams(location.search).get('session');
 if(explicit)return explicit;
 if(location.hash.startsWith('#cart='))return null;
 try{return sessionStorage.getItem(key);}catch{return null;}
}
export function rememberCheckoutToken(token:string,cleanUrl:string){
 try{
  sessionStorage.setItem(key,token);
  history.replaceState({},'',cleanUrl);
  return true;
 }catch{return false;}
}
