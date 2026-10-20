# Flor Semanal

Sistema web para registrar la proyección y producción real de flor de dos fincas. La captura conserva la lógica de la planilla original, pero calcula la semana ISO, totales y cumplimiento automáticamente.

## Funciones incluidas

- Dos fincas disponibles desde el selector superior.
- Semana ISO actual automática y navegación entre semanas.
- Plantillas fijas para Finca P1 y Finca P2, separadas en Producción 1 y Producción 2 en el orden indicado.
- Bloques y variedades de ambas fincas protegidos contra edición y eliminación, también en el servidor.
- Vista de captura para celular con selector de día, sin tabla horizontal.
- Proyección y producción real para lunes a domingo.
- Totales diarios, por producción y por semana en tiempo real; Total arreglos editable por variedad.
- Historial de semanas por finca.
- Exportación `.xlsx` con formato de planilla.
- Persistencia PostgreSQL y migración automática al iniciar.
- Modo temporal en memoria cuando no existe `DATABASE_URL`, útil para revisar la interfaz localmente.
- Configuración de salud y despliegue para Railway.

## Ejecutar localmente

```powershell
npm install
npm start
```

Abrir `http://localhost:3000`. Sin una base configurada, los datos duran hasta que se reinicia el servidor.

Para persistencia local, crear `.env` a partir de `.env.example` y colocar la URL de una base PostgreSQL.

## Desplegar en Railway

1. Subir esta carpeta a un repositorio de GitHub.
2. En Railway, crear un proyecto desde ese repositorio.
3. Agregar un servicio **PostgreSQL** al mismo proyecto.
4. En el servicio web, crear una referencia de variable `DATABASE_URL` apuntando a `Postgres.DATABASE_URL` si Railway no la agregó automáticamente.
5. Desplegar. El sistema crea las tablas y las dos fincas al arrancar.
6. En **Settings → Networking**, generar el dominio público.

Railway usa `railway.json`, instala las dependencias y ejecuta `npm start`. La ruta `/api/health` confirma si PostgreSQL está conectado.

## Personalizar los nombres de las fincas

Después del primer despliegue se pueden cambiar directamente en PostgreSQL:

```sql
UPDATE farms SET name = 'Nombre finca norte' WHERE code = 'F1';
UPDATE farms SET name = 'Nombre finca sur' WHERE code = 'F2';
```

Los registros se guardan como datos estructurados, no como archivos Excel. El Excel se genera bajo demanda a partir de la base de datos, por lo que siempre refleja la versión guardada de la semana.

Las plantillas de Finca P1 y P2 aparecen automáticamente en las semanas nuevas con cantidades en cero. Se guardan en la base de datos al pulsar **Guardar semana**. Las semanas que ya tienen registros conservan sus cantidades; ambos formatos muestran siempre las filas oficiales en su orden fijo.
