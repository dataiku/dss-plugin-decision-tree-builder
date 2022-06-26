#!/usr/bin/python
# -*- coding: utf-8 -*-

from dku_idtb_compatibility.utils import safe_str
from dataiku.customwebapp import get_webapp_config
from dataiku.doctor.posttraining.model_information_handler import PredictionModelInformationHandler


def get_model_handler():
    fmi = get_webapp_config().get("trainedModelFullModelId")
    if fmi is not None:
        return PredictionModelInformationHandler.from_full_model_id(fmi)

    model = dataiku.Model(get_webapp_config()["modelId"])
    version_id = get_webapp_config().get("versionId")
    try:
        params = model.get_predictor(version_id).params
        return PredictionModelInformationHandler(
            params.split_desc, params.core_params, params.model_folder, params.model_folder
        )
    except Exception as e:
        if "ordinal not in range(128)" in safe_str(e):
            raise Exception("Model stress test only supports models built with Python 3. This one was built with Python 2.") from None
        else:
            raise e
