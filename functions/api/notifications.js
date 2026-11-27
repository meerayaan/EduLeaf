export async function onRequest({request,env}) {
 const reply=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
 if(request.method!=='GET')return reply({error:'Method not allowed'},405);
 try {const rows=await env.DB.prepare("SELECT n.id,n.kind,n.title,n.body,n.created_at,s.batch,s.semester,s.category,s.subject,s.material_type FROM notifications n LEFT JOIN submissions s ON s.id=n.submission_id WHERE n.expires_at>CURRENT_TIMESTAMP AND (n.submission_id IS NULL OR (s.status='approved' AND s.deleting=0 AND s.unpublished=0)) ORDER BY n.id DESC LIMIT 100").all();return reply({notifications:rows.results});}catch{return reply({error:'Notifications unavailable'},503)}
}
