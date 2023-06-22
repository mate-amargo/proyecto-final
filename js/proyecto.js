var leftPanel = ui.Panel({style: {width: '30%'}});
var intro = ui.Panel([
  ui.Label({
    value: 'Explorador de Índices de Vegetación',
    style: {fontSize: '20px', fontWeight: 'bold'},
  }),
  ui.Label('Proyecto Final de Carrera.'),
  ui.Label({
    value: 'Juan Alberto Regalado Galván',
    style: {fontSize: '10px', color: 'gray'},
  }),
]);
leftPanel.add(intro);
var panelLine = ui.Panel(null, null, {
  stretch: 'horizontal',
  height: '1px',
  backgroundColor: '000',
  margin: '8px 0px 8px 0px'
});
leftPanel.add(panelLine);
var startDateSlider = ui.DateSlider({
  start: '2000-01-01',
  end: '2021-12-31',
  value: '2021-03-01',
  period: 1,
  onChange: updateChart,
  style: {stretch: 'horizontal'},
});
var startDatePanel = ui.Panel({
  widgets: startDateSlider,
});
var endDateSlider = ui.DateSlider({
  start: '2000-01-01',
  end: '2022-12-31',
  value: '2022-02-28',
  period: 1,
  onChange: updateChart,
  style: {stretch: 'horizontal'},
});
var endDatePanel = ui.Panel({
  widgets: endDateSlider,
});
var cloudSlider = ui.Slider({
  min: 0,
  max: 100,
  value: 20,
  step: 1,
  onChange: updateChart,
  style: {stretch: 'horizontal'},
});
var indexList = ui.Select({
  items: ['NDVI', 'EVI', 'SAVI'],
  value: 'NDVI',
  onChange: updateIndices,
});
var saviSlider = ui.Slider({
  min: -1,
  max: 1,
  value: 0.5,
  step: 0.01,
  onChange: updateChart,
  style: {stretch: 'horizontal'},
});
var saviLabel = ui.Label({
  value: 'L :',
  style: {padding: '0px 10px 0px 10px'},
});
var saviPanel = ui.Panel({
  widgets: [saviLabel, saviSlider],
  layout: ui.Panel.Layout.flow('horizontal'),
  style: {stretch: 'horizontal', shown: false}
});
var buttonPanel = ui.Panel({
  widgets: [
    ui.Button({
      label: 'Punto',
      onClick: drawPoint,
      style: {stretch: 'horizontal', margin: '2px'},
    }),
    ui.Button({
      label: 'Polígono',
      onClick: drawPolygon,
      style: {stretch: 'horizontal', margin: '2px'},
    }),
    ui.Button({
      label: 'Rectángulo',
      onClick: drawRectangle,
      style: {stretch: 'horizontal', margin: '2px'},
    }),
  ],
  layout: ui.Panel.Layout.flow('horizontal'),
  style: {margin: '2px'},
});
var optionsPanel = ui.Panel([
  ui.Label({
    value: 'Elija las opciones',
    style: {fontSize: '15px', fontWeight: 'bold'},
  }),
  ui.Label({value: '1. Fecha inicial:'}),
  startDatePanel,
  ui.Label({value: '2. Fecha final:'}),
  endDatePanel,
  ui.Label({value: '3. Porcentaje de nubes:'}),
  cloudSlider,
  ui.Label({value: '4. Seleccione un índice:'}),
  indexList,
  saviPanel,
  ui.Label({value: '5. Seleccione un modo de dibujo:'}),
  buttonPanel,
]);
leftPanel.add(optionsPanel);
var mapPanel = ui.Map({center: {lon: -62.433585, lat: -37.284195}});
mapPanel.setZoom(14);
mapPanel.setOptions('HYBRID');
var chart = ui.Label({
  value: 'Dibuje una región o seleccione un punto para graficar.',
  style: {textAlign: 'center', stretch: 'both', fontSize: '18px'},
});
var chartPanel = ui.Panel(chart);
var mapChartSplitPanel = ui.Panel(ui.SplitPanel({
  firstPanel: mapPanel,
  secondPanel: chartPanel,
  orientation: 'vertical',
  wipe: false,
}));

ui.root.clear();
ui.root.add(ui.SplitPanel(leftPanel, mapChartSplitPanel));

var drawingTools = mapPanel.drawingTools();
drawingTools.onDraw(updateChart);
drawingTools.setShown(false);
var layers = drawingTools.layers();

var MAX_CLOUD_COVER = 100; // Queremos quedarnos con todas las imagenes
var NIR_DARK_THRESHOLD = 0.15; // Valores menores se consideran nubes
var CLOUD_PROJECTION_DISTANCE = 1; // Distancia en km para buscar sombras
var BUFFER = 50; // Distancia en metros para dilatar el borde de las nubes

function addNDVI(image) {
  // Añade la banda NDVI a la imagen dada
  var ndvi = image.normalizedDifference(['B8', 'B4']).rename('NDVI');
  return image.addBands(ndvi);
}

function addEVI(image) {
  // Añade la banda EVI a la imagen dada
  var evi = ee.Image().expression({
    expression: '2.5 * ((NIR - RED) / (NIR + C1*RED - C2*BLUE + L))',
    map: {
      'NIR': image.select('B8'),
      'RED': image.select('B4'),
      'BLUE': image.select('B2'),
      'L': 1,
      'C1': 6,
      'C2': 7.5,
    }
  }).rename('EVI');
  return image.addBands(evi);
}

function addSAVI(image) {
  // Añade la banda SAVI a la imagen dada
  var savi = ee.Image().expression({
    expression: '((1 + L) * (NIR - RED)) / (NIR + RED + L)',
    map: {
      'NIR': image.select('B8'),
      'RED': image.select('B4'),
      'L': saviSlider.getValue(),
    }
  }).rename('SAVI');
  return image.addBands(savi);
}

function get_all_dates(start_date, end_date, geometry) {
    var collection = ee.ImageCollection('COPERNICUS/S2_SR')
      .filterDate(start_date, end_date)
      .filterBounds(geometry);

    function get_dates_all(image, list) {
        var local_ndvi_date = image.date().format("y-M-d");
        return ee.List(list).add(local_ndvi_date);
    }
    var dates_all = collection.iterate(get_dates_all, ee.List([]));
    return ee.List(dates_all);
}

function add_cloud_bands(image) {
  // Selecciona la banda de probabilidad de la imagen s2cloudless
  var cloud_prob = ee.Image(image.get('s2cloudless')).select('probability');

  // Añade la condición de is_cloud usando el valor seteado por el slider
  var cloud_probability_threshold = cloudSlider.getValue();
  var is_cloud = cloud_prob.gt(cloud_probability_threshold).rename('clouds');

  // Añade la probabilidad de nubes y la mascara como bandas
  return image.addBands(ee.Image([cloud_prob, is_cloud]));
}

function add_shadow_bands(image) {
  // Identifica los pixeles que son agua usando la banda SCL
  var not_water = image.select('SCL').neq(6);

  // Identificar los pixeles NIR oscuros que no son agua (potenciales sombras)
  var SR_BAND_SCALE = 1e4;
  var dark_pixels = image.select('B8').lt(NIR_DARK_THRESHOLD*SR_BAND_SCALE)
    .multiply(not_water).rename('dark_pixels');

  // Determina la dirección para proyectar sombras desde nubes (asume proy UTM)
  var shadow_azimuth = ee.Number(90)
    .subtract(ee.Number(image.get('MEAN_SOLAR_AZIMUTH_ANGLE')));

  // Proyecta sombras desde las nubes una distancia CLOUD_PROJECTION_DISTANCE
  var cld_proj = (image
    .select('clouds')
    .directionalDistanceTransform(shadow_azimuth, CLOUD_PROJECTION_DISTANCE*10
    ).reproject({crs: image.select(0).projection(), scale: 100})
      .select('distance')
      .mask()
      .rename('cloud_transform'));

  // Identifica la intersección de pixeles oscuros con la proyección de nubes
  var shadows = cld_proj.multiply(dark_pixels).rename('shadows');

  // Añade los pixes oscuros, la proyectión de nubes y las sombras como bandas
  return image.addBands(ee.Image([dark_pixels, cld_proj, shadows]));
}

function add_cloud_shadow_mask(image) {

  // Añade la banda de nubes
  var image_cloud = add_cloud_bands(image);

  // Añade la banda de sombra de nubes
  var image_cloud_shadow = add_shadow_bands(image_cloud);

  // Combina las nubes y sombras, seteando 1 para nubes y sombras y 0 c.c.
  var is_cloud_shadow = image_cloud_shadow
    .select('clouds').add(image_cloud_shadow.select('shadows')).gt(0);

  // Quita pequeños parches de nubes y dilata los pixeles restantes BUFFER
  // metros. 20m es para mejor velocidad y asume que las nubes no requieren
  // precisión de 10m.
  is_cloud_shadow = (is_cloud_shadow.focalMin(2).focalMax(BUFFER*2/20)
    .reproject({crs: image.select([0]).projection(), scale: 20})
    .rename('cloudmask'));

  // Añade la máscara final de nubes y sombres como banda.
  return image.addBands(is_cloud_shadow);

}

function apply_colud_shadow_mask(image) {
  // Selecciona la banda de nubes/sombras e invierte para que esos pixeles
  // sean 0 y el resto 1.
  var not_cloud_shadow = image.select('cloudmask').not();

  // Selecciona las bandas de reflectancia y les aplica la máscara
  return image.select('B.*').updateMask(not_cloud_shadow);
}

function get_s2_sr_cloud_colection(geometry, start_date, end_date) {
    // Importa y filtra la colección de reflectancia
    var s2_sr_col = (ee.ImageCollection('COPERNICUS/S2_SR')
      .filterBounds(geometry)
      .filterDate(start_date, end_date)
      .filter(ee.Filter.lte('CLOUDY_PIXEL_PERCENTAGE', MAX_CLOUD_COVER))
    );

    // Importa y filtra la colección de nubes
    var s2_cloudless_col = (
      ee.ImageCollection('COPERNICUS/S2_CLOUD_PROBABILITY')
      .filterBounds(geometry)
      .filterDate(start_date, end_date)
    );

    // Une las dos colecciones usando la propiedad 'system:index'
    return ee.ImageCollection(ee.Join.saveFirst('s2cloudless')
      .apply({
        primary : s2_sr_col,
        secondary : s2_cloudless_col,
        condition : ee.Filter.equals({
          leftField : 'system:index',
          rightField : 'system:index'
        })
      })
    );
}

function index_function(index) {
  if (index === 'NDVI') {
    return addNDVI;
  } else if (index === 'EVI') {
    return addEVI;
  } else if (index === 'SAVI') {
    return addSAVI;
  }
}

function index_over_time(start_date, end_date, geometry, index, reducer) {
  // Devuelve una lista de valores desde start_date hasta end_date
  // Para el índice y reducer dados, filtrando las imagenes con nubes y
  // sombras

  var collection_cloudless = get_s2_sr_cloud_colection(geometry, start_date, end_date)
    .map(add_cloud_shadow_mask)
    .map(apply_colud_shadow_mask)
    .map(index_function(index));

  // Image reduction aplicada a cada imagen
  function reduce_dataset_region(image, list) {
    // Toma el punto más cercano
    var local_index_image = image
      .select(index)
      .reduceRegion(reducer,geometry,10)
      .get(index);
    return ee.List(list).add([local_index_image]).flatten();
  }

  var data = collection_cloudless.iterate(reduce_dataset_region, ee.List([]));
  return ee.List(data);
}

function chartTimeSeries() {
  var start_date = ee.Date(ee.List(startDateSlider.getValue()).get(0));
  var end_date = ee.Date(ee.List(endDateSlider.getValue()).get(0));
  var geometry;
  if (layers.length() > 0) {
    geometry = layers.get(0).geometries().get(0);
  } else {
    return null;
  }
  var index = indexList.getValue();
  var data = index_over_time(start_date, end_date, geometry, index, ee.Reducer.mean());
  var dates = get_all_dates(start_date, end_date, geometry);
  var plot = ui.Chart.array.values({array: data, axis: 0, xLabels: dates})
  .setChartType('LineChart')
  .setOptions({
    title: 'Índice',
    interpolateNulls: true,
    lineWidth: 1,
    pointSize: 3,
    series: {
      0: {
        labelInLegend: index,
      },
    },
  });
  return plot;
}

var drawType = '';
function clearGeometry() {
  var layers = drawingTools.layers();
  if (layers.get(0)) {
    layers.get(0).geometries().remove(layers.get(0).geometries().get(0));
  }
}

function drawPoint() {
  drawType = 'point';
  clearGeometry();
  drawingTools.setShape('point');
  drawingTools.draw();
}

function drawPolygon() {
  drawType = 'polygon';
  clearGeometry();
  drawingTools.setShape('polygon');
  drawingTools.draw();
}

function drawRectangle() {
  drawType = 'rectangle';
  clearGeometry();
  drawingTools.setShape('rectangle');
  drawingTools.draw();
}

function updateIndices() {
  var index = indexList.getValue();
  if (index === 'SAVI') {
    saviPanel.style().set({shown: true});
  } else {
    saviPanel.style().set({shown: false});
  }
  updateChart();
}

function updateChart() {
  var plot = chartTimeSeries();
  if (plot !== null) {
    chartPanel.widgets().set(0, plot);
    chartPanel.widgets().get(0).style().set({stretch: 'both'});
    if (layers.get(0).geometries().length() > 1) {
      layers.get(0).geometries().remove(layers.get(0).geometries().get(0));
    }
  }
}
