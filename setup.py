import setuptools

with open("README.md", "r") as fd:
    long_desc = fd.read()


setuptools.setup(
    name="dss-plugin-decision-tree-builder",
    version="0.0.1",
    description="Build and explore decision trees, and use them to score and evaluate data",
    author="Dataiku",
    long_description=long_desc,
    long_description_content_type="text/markdown",
    url="https://www.dataiku.com",
    packages=setuptools.find_packages(),
    classifiers=[
            'Intended Audience :: End Users/Desktop',
            'License :: OSI Approved :: Apache Software License',
            'Topic :: Scientific/Engineering :: Visualization',
            'Programming Language :: Python',
            'Operating System :: OS Independent'
        ],
    python_requires='>=2.7',
    install_requires=[
        "scikit-learn>=0.24,<1.0",
        "flask>=1.0,<1.1",
        "pandas==1.0.5"
        ]
)
