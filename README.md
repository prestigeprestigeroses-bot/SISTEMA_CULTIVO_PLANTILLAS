# Flor Semanal

Sistema web para registrar la proyección y producción real de flor de dos fincas. La captura conserva la lógica de la planilla original, pero calcula la semana ISO, totales y cumplimiento automáticamente.

## Funciones incluidas

- Dos fincas disponibles desde el selector superior.
- Identificación visual automática: P1 en verde y P2 en azul en todas las secciones.
- Semana ISO actual automática y navegación entre semanas.
- Plantillas fijas para Finca P1 y Finca P2, separadas en Producción 1 y Producción 2 en el orden indicado.
- Bloques y variedades de ambas fincas protegidos contra edición y eliminación, también en el servidor.
- Vista de captura para celular con filas tipo planilla, selector de día y botón de pantalla completa en proyección, temperatura, registro hídrico e inventarios. Al abrir una semana se selecciona el día actual; los demás días se muestran grises y hoy se marca en verde. Proyección se distingue en amarillo y Real en verde claro. El modo ampliado se ajusta al teclado del teléfono para no cerrarse durante la captura.
- Proyección y producción real para lunes a domingo.
- Totales diarios, por producción y por semana en tiempo real; Total arreglos editable por variedad.
- Historial de semanas por finca.
- Secciones de **Temperatura** y **Registro hídrico** por finca y semana, con captura diaria adaptable a celular.
- Sección de **Poscosecha** con dos inventarios para P1 (inventario propio y flor que amanece de P2) y uno para P2. El inventario propio de P1 y el de P2 incluyen inventario ramos, flor a granel y de guarde; flor que amanece de P2 solo incluye flor a granel.
- Tres accesos separados: **Producción** (edita proyección, temperatura y agua), **Poscosecha** (edita inventarios) y **Consulta** (ve todos los registros de P1 y P2 sin modificarlos).
- Captura por fecha para inventario ramos y por mes/día para granel y guarde; el granel cuenta tabacos, la guarde cuenta ramos y los tallos se calculan con los factores de cada plantilla.
- Promedios semanales de temperatura, humedad y precipitación a partir de los días registrados.
- Consumo de P1 calculado como lectura final menos lectura inicial; consumo de P2 como goteo más cacho. El consumo acumulado en litros por cama usa el consumo m³ × 1000 / número de camas.
- Exportación `.xlsx` de proyección, temperatura, registro hídrico, cada inventario y total mensual de inventarios por finca.
- Total mensual de tallos por finca en Poscosecha, sumando inventario ramos, granel, guarde y FN de todos los inventarios disponibles para esa finca.
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

El acceso requiere `AUTH_PRODUCTION_PASSWORD`, `AUTH_POSCOSECHA_PASSWORD`, `AUTH_VIEWER_PASSWORD` y `SESSION_SECRET` en `.env`. Las tres contraseñas deben ser distintas y tener al menos 12 caracteres; `SESSION_SECRET` debe tener al menos 32 caracteres aleatorios. El archivo `.env` está excluido de Git. Para compartir la consulta, entrega a esas personas la URL desplegada, el tipo de acceso **Consulta** y solo su contraseña. La contraseña de Consulta es compartida: para retirar el acceso de alguien, cámbiala y distribuye la nueva a quienes deban conservarlo.

## Desplegar en Railway

1. Subir esta carpeta a un repositorio de GitHub.
2. En Railway, crear un proyecto desde ese repositorio.
3. Agregar un servicio **PostgreSQL** al mismo proyecto.
4. En el servicio web, crear una referencia de variable `DATABASE_URL` apuntando a `Postgres.DATABASE_URL` si Railway no la agregó automáticamente. Configurar también las cuatro variables de acceso del párrafo anterior y `NODE_ENV=production`.
5. Desplegar. El sistema crea las tablas y las dos fincas al arrancar.
6. En **Settings → Networking**, generar el dominio público.

Railway usa `railway.json`, instala las dependencias y ejecuta `npm start`. La ruta `/api/health` confirma si PostgreSQL está conectado.

## Personalizar los nombres de las fincas

Después del primer despliegue se pueden cambiar directamente en PostgreSQL:

```sql
UPDATE farms SET name = 'Nombre finca norte' WHERE code = 'F1';
UPDATE farms SET name = 'Nombre finca sur' WHERE code = 'F2';
```

Los registros se guardan como datos estructurados, no como archivos Excel. Cada Excel se genera bajo demanda a partir de los registros guardados. Los botones de exportación guardan primero los cambios pendientes cuando el acceso permite editar.

Las plantillas de Finca P1 y P2 aparecen automáticamente en las semanas nuevas con cantidades en cero. Al modificar un dato, se autoguarda aproximadamente un segundo después de dejar de escribir; **Guardar semana** sigue disponible para guardar de inmediato. Las semanas que ya tienen registros conservan sus cantidades; ambos formatos muestran siempre las filas oficiales en su orden fijo.

Los registros de temperatura y agua también se autoguardan al modificar un dato; **Guardar registro** permite hacerlo de inmediato. Comparten los datos de la misma finca y semana. El número de camas aparece precargado en 1.523 para P1 y 1.313 para P2 según las planillas de referencia, pero puede modificarse para cada semana. Los días sin medición se dejan vacíos; un cero ingresado sí cuenta para el promedio.

En **Poscosecha**, elige la finca, el tipo de inventario y la fecha. El inventario ramos se captura para ese día; granel y guarde muestran los días del mes. Los inventarios se autoguardan por finca, tipo, año y mes en PostgreSQL; **Guardar inventario** permite hacerlo de inmediato. Las presentaciones sin factor de tallos quedan en «Cantidades sin conversión», sin inventarles un equivalente. En modo demostración, los datos duran hasta reiniciar el servidor.

En **Flor a granel**, la columna **FN** (fin de corte) aparece después del día 31. Sus cantidades son tallos directos: se suman a **Total tallos** sin multiplicarse por el factor de tallos por tabaco ni aumentar **Total tabacos**. En celular, FN tiene una sección propia debajo de la captura diaria.

El total de tallos de la finca corresponde al **mes seleccionado** y suma los tallos convertibles registrados en todas sus plantillas de inventario. P1 incluye su inventario propio y «Flor que amanece de P2»; P2 incluye el inventario P2. Las cantidades sin factor de conversión quedan fuera del total de tallos y se muestran por separado en el Excel del inventario. El total es una suma de registros mensuales, no un saldo de existencias al cierre del mes.
