const modulePath = "./message";
const module = await import(modulePath);

console.log(module.message);
