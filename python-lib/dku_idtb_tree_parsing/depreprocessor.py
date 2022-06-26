def denormalize_feature_value(scaler, feature_value):
    if scaler is not None:
        inv_scale = scaler.inv_scale if scaler.inv_scale != 0.0 else 1.0
        return (feature_value / inv_scale) + scaler.shift
    return feature_value

def descale_numerical_thresholds(extract, feature_names, rescalers):
    features = extract.feature.tolist()
    return [thresh if ft < 0
            else denormalize_feature_value(rescalers.get(feature_names[ft]), thresh)
            for (ft, thresh) in zip(features, extract.threshold.tolist())]
