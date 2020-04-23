def breadth_first_index_generator(H, K=2):
    """
    :param K: number of branches per node
    :param H: depth
    :return:
    """

    stack = list()
    push, pop = list.append, list.pop

    push(stack, (0, 0))

    while stack:
        label, depth = pop(stack)
        yield label

        if depth + 1 > H:  # leaf node
            continue

        for i in reversed(range(K)):
            push(stack, (K * label + 1 + i, depth + 1))